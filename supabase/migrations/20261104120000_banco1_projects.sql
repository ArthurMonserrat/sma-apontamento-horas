begin;

-- =====================================================================
-- Banco 1 — projetos cadastrados pela diretoria
-- * banco1_projects: código, supervisão, cliente, cliente final, local,
--   segmento de mercado, descrição e situação (ativo/inativo).
-- * banco1_project_activities: atividades de cada projeto com complemento e
--   executor (pessoa). Atividade sem executor vale para qualquer pessoa.
-- * Todos com acesso ao Banco 1 leem; só a diretoria grava, pela função
--   banco1_save_projects (cadastro na tela e importação do Excel).
-- * Apontamentos ganham project_id e project_activity_id.
-- Pré-requisito: 20261027120000_banco1_time_entries.sql aplicada.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

do $$
begin
  if to_regclass('public.banco1_time_entries') is null then
    raise exception 'Aplique antes a migration 20261027120000_banco1_time_entries.sql.';
  end if;
end;
$$;

create table if not exists public.banco1_projects (
  id uuid primary key default gen_random_uuid(),
  code text not null check (length(btrim(code)) between 1 and 40),
  supervision_code text check (supervision_code is null or length(supervision_code) <= 60),
  client text not null check (length(btrim(client)) between 1 and 160),
  final_client text check (final_client is null or length(final_client) <= 160),
  location text check (location is null or length(location) <= 160),
  market_segment text check (market_segment is null or length(market_segment) <= 80),
  description text not null default '' check (length(description) <= 300),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists banco1_projects_code_key on public.banco1_projects (upper(btrim(code)));

create table if not exists public.banco1_project_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.banco1_projects(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  complement text check (complement is null or length(complement) <= 300),
  executor_id uuid references public.profiles(id) on delete set null,
  executor_name text check (executor_name is null or length(executor_name) <= 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists banco1_project_activities_unique_idx on public.banco1_project_activities (
  project_id, lower(btrim(name)), lower(btrim(coalesce(complement, ''))), lower(btrim(coalesce(executor_name, '')))
);
create index if not exists banco1_project_activities_executor_idx on public.banco1_project_activities (executor_id) where active;

comment on table public.banco1_projects is 'Projetos do Banco 1 cadastrados pela diretoria (tela Projetos ou importação do Excel).';
comment on table public.banco1_project_activities is 'Atividades dos projetos, com executor. Sem executor = qualquer pessoa pode apontar.';

alter table public.banco1_time_entries add column if not exists project_id uuid references public.banco1_projects(id) on delete set null;
alter table public.banco1_time_entries add column if not exists project_activity_id uuid references public.banco1_project_activities(id) on delete set null;
create index if not exists banco1_time_entries_project_idx on public.banco1_time_entries (project_id, entry_date);

alter table public.banco1_projects enable row level security;
alter table public.banco1_project_activities enable row level security;
revoke all privileges on table public.banco1_projects, public.banco1_project_activities from public, anon, authenticated;
grant select on table public.banco1_projects, public.banco1_project_activities to authenticated;
grant all privileges on table public.banco1_projects, public.banco1_project_activities to service_role;

drop policy if exists banco1_projects_select on public.banco1_projects;
create policy banco1_projects_select on public.banco1_projects for select to authenticated
using (private.module_role('BANCO_1') is not null);

drop policy if exists banco1_project_activities_select on public.banco1_project_activities;
create policy banco1_project_activities_select on public.banco1_project_activities for select to authenticated
using (private.module_role('BANCO_1') is not null);

-- Nome sem acento, minúsculo e com espaços simples (para achar o executor pelo nome da planilha).
create or replace function private.banco1_name_key(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(btrim(coalesce(value, ''))),
      'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g')
$$;

/*
 * Cadastra/atualiza projetos (tela Projetos e importação do Excel).
 * projects: [{ code, supervision_code, client, final_client, location, market_segment, description, active?,
 *              activities: [{ name, complement, executor_id?, executor_name? }] }]
 * replace_activities: true = a lista enviada passa a ser a lista do projeto (as demais ficam inativas);
 *                     false = só acrescenta/reativa (importação).
 * Executor: executor_id, ou o nome procurado entre as pessoas com acesso ao Banco 1.
 */
create or replace function public.banco1_save_projects(projects jsonb, replace_activities boolean default false)
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
  if private.module_role('BANCO_1') is distinct from 'diretor' then
    raise exception 'Somente a diretoria pode cadastrar projetos.' using errcode = '42501';
  end if;
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
        updated_at = now()
      where p.id = project_row.id
      returning * into project_row;
      updated_projects := updated_projects + 1;
    else
      insert into public.banco1_projects (code, supervision_code, client, final_client, location, market_segment, description, active, created_by)
      values (
        clean_code,
        nullif(btrim(coalesce(item->>'supervision_code', '')), ''),
        btrim(item->>'client'),
        nullif(btrim(coalesce(item->>'final_client', '')), ''),
        nullif(btrim(coalesce(item->>'location', '')), ''),
        nullif(btrim(coalesce(item->>'market_segment', '')), ''),
        btrim(coalesce(item->>'description', '')),
        coalesce((item->>'active')::boolean, true),
        auth.uid()
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
        and lower(btrim(coalesce(pa.executor_name, ''))) = lower(btrim(coalesce(executor_label, '')));
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

comment on function public.banco1_save_projects(jsonb, boolean) is 'Diretoria: cadastra/atualiza projetos e atividades do Banco 1 (tela e importação do Excel).';

create or replace function public.banco1_set_project_active(project_id uuid, active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.module_role('BANCO_1') is distinct from 'diretor' then
    raise exception 'Somente a diretoria pode alterar projetos.' using errcode = '42501';
  end if;
  update public.banco1_projects as p set active = banco1_set_project_active.active, updated_at = now()
  where p.id = banco1_set_project_active.project_id;
  if not found then
    raise exception 'Projeto não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

-- Apontamento em projeto: atividade precisa ser do projeto e da pessoa (ou sem executor).
-- Só confere quando o projeto/atividade muda (apontamentos antigos continuam válidos se o executor mudar depois).
create or replace function private.banco1_time_entry_project_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  act public.banco1_project_activities;
  proj public.banco1_projects;
begin
  if tg_op = 'UPDATE'
     and new.project_id is not distinct from old.project_id
     and new.project_activity_id is not distinct from old.project_activity_id then
    return new;
  end if;
  if new.project_activity_id is not null then
    select * into act from public.banco1_project_activities as a where a.id = new.project_activity_id;
    if not found or not act.active then
      raise exception 'Atividade do projeto não encontrada ou inativa.' using errcode = 'check_violation';
    end if;
    if new.project_id is null then
      new.project_id := act.project_id;
    elsif new.project_id <> act.project_id then
      raise exception 'A atividade não pertence ao projeto escolhido.' using errcode = 'check_violation';
    end if;
    if act.executor_id is not null and act.executor_id <> new.collaborator_id then
      raise exception 'Esta atividade do projeto é de outro executor.' using errcode = 'check_violation';
    end if;
  end if;
  if new.project_id is not null then
    select * into proj from public.banco1_projects as p where p.id = new.project_id;
    if not found or not proj.active then
      raise exception 'Projeto não encontrado ou inativo.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists banco1_time_entries_project_check on public.banco1_time_entries;
create trigger banco1_time_entries_project_check
before insert or update of project_id, project_activity_id on public.banco1_time_entries
for each row execute function private.banco1_time_entry_project_check();

revoke all privileges on function private.banco1_time_entry_project_check() from public, anon, authenticated;

revoke all privileges on function private.banco1_name_key(text) from public, anon;
grant execute on function private.banco1_name_key(text) to authenticated;
revoke all privileges on function public.banco1_save_projects(jsonb, boolean) from public, anon;
revoke all privileges on function public.banco1_set_project_active(uuid, boolean) from public, anon;
grant execute on function public.banco1_save_projects(jsonb, boolean) to authenticated;
grant execute on function public.banco1_set_project_active(uuid, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';
