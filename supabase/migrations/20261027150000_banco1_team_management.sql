begin;

-- =====================================================================
-- Banco 1 — gestão de supervisões (equipes) pela tela Equipes da Diretoria
-- * banco1_save_team: cria ou edita uma supervisão (nome, supervisor e
--   colaboradores) numa única operação. Quem entra na equipe sai da
--   equipe anterior. Se o supervisor escolhido estiver como colaborador
--   no Banco 1, ele passa a supervisor no Banco 1.
-- * banco1_deactivate_team: desativa a supervisão e libera os colaboradores.
-- Só a diretoria do Banco 1 pode usar.
-- Pré-requisito: 20261027120000_banco1_time_entries.sql aplicada.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

do $$
begin
  if to_regclass('public.teams') is null or to_regprocedure('public.banco1_people()') is null then
    raise exception 'Aplique antes a migration 20261027120000_banco1_time_entries.sql.';
  end if;
end;
$$;

create or replace function public.banco1_save_team(
  team_id uuid,
  team_name text,
  supervisor uuid,
  member_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := btrim(coalesce(team_name, ''));
  target_id uuid := team_id;
  existing public.teams;
  supervisor_role text;
  members uuid[] := coalesce(member_ids, '{}');
  invalid_count integer;
  member uuid;
begin
  if private.module_role('BANCO_1') is distinct from 'diretor' then
    raise exception 'Somente a diretoria pode gerenciar supervisões.' using errcode = '42501';
  end if;
  if length(clean_name) not between 1 and 120 then
    raise exception 'Informe o nome da supervisão (até 120 caracteres).' using errcode = '22023';
  end if;
  if supervisor is null then
    raise exception 'Escolha o supervisor.' using errcode = '22023';
  end if;

  -- Supervisor: perfil ativo com acesso ativo ao Banco 1.
  select coalesce(a.role, p.role)::text into supervisor_role
  from public.profiles as p
  join public.profile_module_access as a on a.profile_id = p.id and a.module = 'BANCO_1' and a.active
  where p.id = supervisor and p.active;
  if supervisor_role is null then
    raise exception 'O supervisor escolhido não tem acesso ativo ao Banco 1.' using errcode = '22023';
  end if;
  if supervisor_role = 'colaborador' then
    update public.profile_module_access set role = 'supervisor'
    where profile_id = supervisor and module = 'BANCO_1';
  end if;

  -- Colaboradores: sem repetição, sem o próprio supervisor e todos com acesso ativo ao Banco 1.
  members := array(select distinct m from unnest(members) as m where m is not null and m <> supervisor);
  select count(*) into invalid_count
  from unnest(members) as m
  where not exists (
    select 1 from public.profiles as p
    join public.profile_module_access as a on a.profile_id = p.id and a.module = 'BANCO_1' and a.active
    where p.id = m and p.active
  );
  if invalid_count > 0 then
    raise exception 'Há colaborador sem acesso ativo ao Banco 1 na lista.' using errcode = '22023';
  end if;

  -- Cria ou edita a supervisão.
  if target_id is null then
    select * into existing from public.teams as t where t.module = 'BANCO_1' and t.name = clean_name;
    if found and existing.active then
      raise exception 'Já existe uma supervisão com esse nome.' using errcode = '23505';
    end if;
    if found then
      target_id := existing.id; -- reativa uma supervisão antiga com o mesmo nome
    else
      insert into public.teams (module, name, supervisor_id) values ('BANCO_1', clean_name, supervisor)
      returning id into target_id;
    end if;
  else
    if not exists (select 1 from public.teams as t where t.id = target_id and t.module = 'BANCO_1') then
      raise exception 'Supervisão não encontrada.' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.teams as t where t.module = 'BANCO_1' and t.name = clean_name and t.id <> target_id) then
      raise exception 'Já existe uma supervisão com esse nome.' using errcode = '23505';
    end if;
  end if;

  update public.teams as t
  set name = clean_name, supervisor_id = supervisor, active = true, updated_at = now()
  where t.id = target_id;

  -- O supervisor não fica como membro da própria equipe.
  update public.team_members as tm set active = false
  where tm.module = 'BANCO_1' and tm.team_id = target_id and tm.active and not (tm.profile_id = any(members));

  foreach member in array members loop
    -- Quem entra sai da equipe anterior (uma equipe ativa por pessoa no Banco 1).
    update public.team_members as tm set active = false
    where tm.module = 'BANCO_1' and tm.profile_id = member and tm.team_id <> target_id and tm.active;

    insert into public.team_members (team_id, module, profile_id, active)
    values (target_id, 'BANCO_1', member, true)
    on conflict on constraint team_members_pkey do update
      set active = true,
          joined_at = case when public.team_members.active then public.team_members.joined_at else now() end;
  end loop;

  return target_id;
end;
$$;

comment on function public.banco1_save_team(uuid, text, uuid, uuid[]) is 'Diretoria: cria/edita supervisão do Banco 1 com supervisor e colaboradores (move quem estava em outra equipe).';

create or replace function public.banco1_deactivate_team(team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.module_role('BANCO_1') is distinct from 'diretor' then
    raise exception 'Somente a diretoria pode gerenciar supervisões.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.teams as t where t.id = team_id and t.module = 'BANCO_1') then
    raise exception 'Supervisão não encontrada.' using errcode = 'P0002';
  end if;
  update public.team_members as tm set active = false where tm.team_id = banco1_deactivate_team.team_id and tm.active;
  update public.teams as t set active = false, updated_at = now() where t.id = banco1_deactivate_team.team_id;
end;
$$;

comment on function public.banco1_deactivate_team(uuid) is 'Diretoria: desativa a supervisão do Banco 1 e libera os colaboradores.';

revoke all privileges on function public.banco1_save_team(uuid, text, uuid, uuid[]) from public, anon;
revoke all privileges on function public.banco1_deactivate_team(uuid) from public, anon;
grant execute on function public.banco1_save_team(uuid, text, uuid, uuid[]) to authenticated;
grant execute on function public.banco1_deactivate_team(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
