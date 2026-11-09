begin;

-- =====================================================================
-- Banco 1 — projetos: mesma atividade não duplica por diferença na grafia do executor
-- * Na importação (Excel ou banco SQLite), a atividade existente é encontrada pela
--   pessoa vinculada ou pelo nome sem acento/maiúsculas/espaços repetidos.
--   Ex.: "Sabrina Drumond" e "sabrina  drumond" passam a ser a mesma atividade.
-- Pré-requisito: 20261104120000_banco1_projects.sql aplicada.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

do $$
begin
  if to_regclass('public.banco1_projects') is null then
    raise exception 'Aplique antes a migration 20261104120000_banco1_projects.sql.';
  end if;
end;
$$;

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

comment on function public.banco1_save_projects(jsonb, boolean) is 'Diretoria: cadastra/atualiza projetos e atividades do Banco 1 (tela, Excel e banco SQLite).';

revoke all privileges on function public.banco1_save_projects(jsonb, boolean) from public, anon;
grant execute on function public.banco1_save_projects(jsonb, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';
