begin;

-- =====================================================================
-- Banco 1 — sincronização automática dos projetos com o ESTUDOS.sqlite (OneDrive)
-- * banco1_projects.source: 'manual' (tela/Excel/arquivo) ou 'onedrive' (sincronização).
-- * banco1_project_sync_runs: histórico das sincronizações (a diretoria vê a última).
-- * banco1_sync_projects: chamada só pelo servidor (service_role). Espelha o arquivo:
--   atualiza projetos e atividades, desativa atividades que saíram do arquivo e
--   desativa projetos sincronizados que não estão mais no arquivo.
-- * banco1_can_sync_projects: o servidor confere se quem pediu "Sincronizar agora" é diretoria.
-- * private.banco1_onedrive_connection: conexão com o OneDrive do Paulo (refresh token
--   CRIPTOGRAFADO pelo servidor). Só o servidor lê/grava; a diretoria vê só conta e situação.
-- Pré-requisito: 20261109120000_banco1_projects_executor_match.sql aplicada.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

do $$
begin
  if to_regclass('public.banco1_projects') is null then
    raise exception 'Aplique antes a migration 20261104120000_banco1_projects.sql.';
  end if;
end;
$$;

alter table public.banco1_projects add column if not exists source text not null default 'manual';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'banco1_projects_source_check') then
    alter table public.banco1_projects add constraint banco1_projects_source_check check (source in ('manual', 'onedrive'));
  end if;
end;
$$;

create table if not exists public.banco1_project_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  trigger text not null check (trigger in ('agendado', 'manual')),
  status text not null check (status in ('ok', 'sem_mudancas', 'erro')),
  file_etag text,
  file_modified_at timestamptz,
  summary jsonb,
  error text check (error is null or length(error) <= 1000),
  requested_by uuid references public.profiles(id) on delete set null
);
create index if not exists banco1_project_sync_runs_started_idx on public.banco1_project_sync_runs (started_at desc);
comment on table public.banco1_project_sync_runs is 'Sincronizações dos projetos do Banco 1 com o ESTUDOS.sqlite do OneDrive.';

alter table public.banco1_project_sync_runs enable row level security;
revoke all privileges on table public.banco1_project_sync_runs from public, anon, authenticated;
grant select on table public.banco1_project_sync_runs to authenticated;
grant all privileges on table public.banco1_project_sync_runs to service_role;

drop policy if exists banco1_project_sync_runs_select on public.banco1_project_sync_runs;
create policy banco1_project_sync_runs_select on public.banco1_project_sync_runs for select to authenticated
using (private.module_role('BANCO_1') = 'diretor');

-- Núcleo do cadastro (sem checagem de papel): usado pela tela (diretoria) e pela sincronização (servidor).
create or replace function private.banco1_apply_projects(projects jsonb, replace_activities boolean, mark_source text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  activity jsonb;
  project_row public.banco1_projects;
  clean_code text;
  executor uuid;
  executor_label text;
  match_count integer;
  kept_ids uuid[];
  activity_id uuid;
  created_projects integer := 0;
  updated_projects integer := 0;
  saved_activities integer := 0;
  removed_activities integer := 0;
  unmatched text[] := '{}';
  saved_ids uuid[] := '{}';
begin
  if projects is null or jsonb_typeof(projects) <> 'array' or jsonb_array_length(projects) = 0 then
    raise exception 'Nenhum projeto informado.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(projects) loop
    clean_code := upper(btrim(coalesce(item->>'code', '')));
    if clean_code = '' then
      raise exception 'Há projeto sem código.' using errcode = '22023';
    end if;
    if btrim(coalesce(item->>'client', '')) = '' then
      raise exception 'Informe o cliente do projeto %.', clean_code using errcode = '22023';
    end if;

    select * into project_row from public.banco1_projects as p where upper(btrim(p.code)) = clean_code;
    if found then
      update public.banco1_projects as p set
        -- Campo ausente no envio mantém o valor atual; campo enviado vazio apaga.
        supervision_code = case when item ? 'supervision_code' then nullif(btrim(coalesce(item->>'supervision_code', '')), '') else p.supervision_code end,
        client = btrim(item->>'client'),
        final_client = case when item ? 'final_client' then nullif(btrim(coalesce(item->>'final_client', '')), '') else p.final_client end,
        location = case when item ? 'location' then nullif(btrim(coalesce(item->>'location', '')), '') else p.location end,
        market_segment = case when item ? 'market_segment' then nullif(btrim(coalesce(item->>'market_segment', '')), '') else p.market_segment end,
        description = case when item ? 'description' then btrim(coalesce(item->>'description', '')) else p.description end,
        active = coalesce((item->>'active')::boolean, p.active),
        source = coalesce(mark_source, p.source),
        updated_at = now()
      where p.id = project_row.id
      returning * into project_row;
      updated_projects := updated_projects + 1;
    else
      insert into public.banco1_projects (code, supervision_code, client, final_client, location, market_segment, description, active, created_by, source)
      values (
        clean_code,
        nullif(btrim(coalesce(item->>'supervision_code', '')), ''),
        btrim(item->>'client'),
        nullif(btrim(coalesce(item->>'final_client', '')), ''),
        nullif(btrim(coalesce(item->>'location', '')), ''),
        nullif(btrim(coalesce(item->>'market_segment', '')), ''),
        btrim(coalesce(item->>'description', '')),
        coalesce((item->>'active')::boolean, true),
        auth.uid(),
        coalesce(mark_source, 'manual')
      )
      returning * into project_row;
      created_projects := created_projects + 1;
    end if;
    saved_ids := saved_ids || project_row.id;

    kept_ids := '{}';
    for activity in select value from jsonb_array_elements(coalesce(item->'activities', '[]'::jsonb)) loop
      if btrim(coalesce(activity->>'name', '')) = '' then
        continue;
      end if;

      executor := nullif(activity->>'executor_id', '')::uuid;
      executor_label := nullif(btrim(coalesce(activity->>'executor_name', '')), '');
      if executor is not null then
        select coalesce(nullif(btrim(p.full_name), ''), p.email) into executor_label from public.profiles as p where p.id = executor;
        if not found then
          raise exception 'Executor não encontrado no projeto %.', clean_code using errcode = '22023';
        end if;
      elsif executor_label is not null then
        select count(*), min(p.id::text)::uuid into match_count, executor
        from public.profiles as p
        join public.profile_module_access as a on a.profile_id = p.id and a.module = 'BANCO_1' and a.active
        where p.active and private.banco1_name_key(p.full_name) = private.banco1_name_key(executor_label);
        if match_count <> 1 then
          executor := null;
          if not (executor_label = any(unmatched)) then unmatched := unmatched || executor_label; end if;
        end if;
      end if;

      select pa.id into activity_id
      from public.banco1_project_activities as pa
      where pa.project_id = project_row.id
        and lower(btrim(pa.name)) = lower(btrim(activity->>'name'))
        and lower(btrim(coalesce(pa.complement, ''))) = lower(btrim(coalesce(activity->>'complement', '')))
        and (
          (executor is not null and pa.executor_id = executor)
          or private.banco1_name_key(pa.executor_name) = private.banco1_name_key(executor_label)
        )
      order by (pa.executor_id is not distinct from executor) desc, pa.active desc, pa.created_at
      limit 1;
      if found then
        update public.banco1_project_activities as pa
        set executor_id = executor, active = true, updated_at = now()
        where pa.id = activity_id;
      else
        insert into public.banco1_project_activities (project_id, name, complement, executor_id, executor_name)
        values (project_row.id, btrim(activity->>'name'), nullif(btrim(coalesce(activity->>'complement', '')), ''), executor, executor_label)
        returning id into activity_id;
      end if;
      kept_ids := kept_ids || activity_id;
      saved_activities := saved_activities + 1;
    end loop;

    if replace_activities then
      with removed as (
        update public.banco1_project_activities as pa set active = false, updated_at = now()
        where pa.project_id = project_row.id and pa.active and not (pa.id = any(kept_ids))
        returning 1
      )
      select removed_activities + count(*) into removed_activities from removed;
    end if;
  end loop;

  return jsonb_build_object(
    'project_ids', to_jsonb(saved_ids),
    'projects_created', created_projects,
    'projects_updated', updated_projects,
    'activities_saved', saved_activities,
    'activities_removed', removed_activities,
    'unmatched_executors', to_jsonb(unmatched)
  );
end;
$$;


revoke all privileges on function private.banco1_apply_projects(jsonb, boolean, text) from public, anon, authenticated;

create or replace function public.banco1_save_projects(projects jsonb, replace_activities boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.module_role('BANCO_1') is distinct from 'diretor' then
    raise exception 'Somente a diretoria pode cadastrar projetos.' using errcode = '42501';
  end if;
  return private.banco1_apply_projects(projects, replace_activities, null);
end;
$$;

comment on function public.banco1_save_projects(jsonb, boolean) is 'Diretoria: cadastra/atualiza projetos e atividades do Banco 1 (tela, Excel e banco SQLite).';

create or replace function public.banco1_sync_projects(
  projects jsonb,
  sync_trigger text,
  file_etag text default null,
  file_modified_at timestamptz default null,
  requested_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  deactivated integer;
  codes text[];
begin
  if sync_trigger not in ('agendado', 'manual') then
    raise exception 'Origem da sincronização inválida.' using errcode = '22023';
  end if;
  result := private.banco1_apply_projects(projects, true, 'onedrive');

  -- Projetos que vieram do arquivo e não estão mais nele ficam inativos.
  select array_agg(upper(btrim(value->>'code'))) into codes from jsonb_array_elements(projects);
  with gone as (
    update public.banco1_projects as p set active = false, updated_at = now()
    where p.source = 'onedrive' and p.active and not (upper(btrim(p.code)) = any(codes))
    returning 1
  )
  select count(*) into deactivated from gone;
  result := result || jsonb_build_object('projects_deactivated', deactivated, 'projects_in_file', jsonb_array_length(projects));

  insert into public.banco1_project_sync_runs (trigger, status, file_etag, file_modified_at, summary, requested_by)
  values (sync_trigger, 'ok', file_etag, file_modified_at, result - 'project_ids', requested_by);
  return result - 'project_ids';
end;
$$;

comment on function public.banco1_sync_projects(jsonb, text, text, timestamptz, uuid) is 'Servidor: espelha o ESTUDOS.sqlite do OneDrive nos projetos do Banco 1.';

-- Registra sincronização sem mudanças ou com erro.
create or replace function public.banco1_record_project_sync(
  sync_trigger text,
  sync_status text,
  error_message text default null,
  file_etag text default null,
  file_modified_at timestamptz default null,
  requested_by uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.banco1_project_sync_runs (trigger, status, error, file_etag, file_modified_at, requested_by)
  values (sync_trigger, sync_status, left(error_message, 1000), file_etag, file_modified_at, requested_by)
$$;

create or replace function public.banco1_can_sync_projects()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.module_role('BANCO_1') = 'diretor' $$;

revoke all privileges on function public.banco1_save_projects(jsonb, boolean) from public, anon;
grant execute on function public.banco1_save_projects(jsonb, boolean) to authenticated;
revoke all privileges on function public.banco1_sync_projects(jsonb, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.banco1_sync_projects(jsonb, text, text, timestamptz, uuid) to service_role;
revoke all privileges on function public.banco1_record_project_sync(text, text, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.banco1_record_project_sync(text, text, text, text, timestamptz, uuid) to service_role;
revoke all privileges on function public.banco1_can_sync_projects() from public, anon;
grant execute on function public.banco1_can_sync_projects() to authenticated;

-- Conexão com o OneDrive (uma só). O refresh token chega criptografado pelo servidor (AES-256-GCM).
create table if not exists private.banco1_onedrive_connection (
  id boolean primary key default true check (id),
  account_email text not null,
  account_name text,
  refresh_token_enc text not null,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  refreshed_at timestamptz,
  status text not null default 'ativa' check (status in ('ativa', 'expirada')),
  last_error text
);
revoke all privileges on table private.banco1_onedrive_connection from public, anon, authenticated;

create or replace function public.banco1_onedrive_save_connection(account_email text, account_name text, refresh_token_enc text, connected_by uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.banco1_onedrive_connection (id, account_email, account_name, refresh_token_enc, connected_by, connected_at, refreshed_at, status, last_error)
  values (true, account_email, account_name, refresh_token_enc, connected_by, now(), now(), 'ativa', null)
  on conflict (id) do update set
    account_email = excluded.account_email, account_name = excluded.account_name,
    refresh_token_enc = excluded.refresh_token_enc, connected_by = excluded.connected_by,
    connected_at = now(), refreshed_at = now(), status = 'ativa', last_error = null
$$;

create or replace function public.banco1_onedrive_get_connection()
returns table (account_email text, refresh_token_enc text, status text)
language sql
stable
security definer
set search_path = ''
as $$ select c.account_email, c.refresh_token_enc, c.status from private.banco1_onedrive_connection as c where c.id $$;

create or replace function public.banco1_onedrive_update_token(refresh_token_enc text)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.banco1_onedrive_connection as c
  set refresh_token_enc = banco1_onedrive_update_token.refresh_token_enc, refreshed_at = now(), status = 'ativa', last_error = null
  where c.id
$$;

create or replace function public.banco1_onedrive_mark_expired(error_message text)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.banco1_onedrive_connection as c set status = 'expirada', last_error = left(error_message, 300) where c.id
$$;

-- Diretoria: com qual conta o OneDrive está conectado (sem o token).
create or replace function public.banco1_onedrive_status()
returns table (account_email text, account_name text, connected_at timestamptz, status text, last_error text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.account_email, c.account_name, c.connected_at, c.status, c.last_error
  from private.banco1_onedrive_connection as c
  where c.id and private.module_role('BANCO_1') = 'diretor'
$$;

revoke all privileges on function public.banco1_onedrive_save_connection(text, text, text, uuid) from public, anon, authenticated;
revoke all privileges on function public.banco1_onedrive_get_connection() from public, anon, authenticated;
revoke all privileges on function public.banco1_onedrive_update_token(text) from public, anon, authenticated;
revoke all privileges on function public.banco1_onedrive_mark_expired(text) from public, anon, authenticated;
grant execute on function public.banco1_onedrive_save_connection(text, text, text, uuid) to service_role;
grant execute on function public.banco1_onedrive_get_connection() to service_role;
grant execute on function public.banco1_onedrive_update_token(text) to service_role;
grant execute on function public.banco1_onedrive_mark_expired(text) to service_role;
revoke all privileges on function public.banco1_onedrive_status() from public, anon;
grant execute on function public.banco1_onedrive_status() to authenticated;

commit;

notify pgrst, 'reload schema';
