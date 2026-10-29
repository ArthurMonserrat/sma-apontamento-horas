begin;

-- =====================================================================
-- Banco 1 — mais de um supervisor por supervisão (co-supervisores)
-- * teams.supervisor_id continua sendo o supervisor principal.
-- * team_supervisors guarda os supervisores adicionais.
-- * Todos os supervisores da equipe veem e decidem apontamentos e ausências,
--   recebem os avisos da equipe e podem publicar para ela.
-- * banco1_save_team ganha o parâmetro co_supervisor_ids.
-- Pré-requisitos: 20261027150000_banco1_team_management.sql e
-- 20261028120000_profiles_job_title.sql aplicadas.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.banco1_people()') is null or to_regclass('public.teams') is null then
    raise exception 'Aplique antes as migrations de equipes do Banco 1.';
  end if;
end;
$$;

create table if not exists public.team_supervisors (
  team_id uuid not null,
  module text not null check (module in ('BANCO_1', 'BANCO_2')),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint team_supervisors_pkey primary key (team_id, profile_id),
  foreign key (team_id, module) references public.teams(id, module) on delete cascade
);

create index if not exists team_supervisors_profile_idx on public.team_supervisors (profile_id);

comment on table public.team_supervisors is 'Supervisores adicionais de uma supervisão (além de teams.supervisor_id).';

-- O usuário logado é supervisor (principal ou adicional) desta equipe ativa?
create or replace function private.is_team_supervisor(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teams as t
    where t.id = target_team_id and t.active
      and (t.supervisor_id = auth.uid()
           or exists (select 1 from public.team_supervisors as ts where ts.team_id = t.id and ts.profile_id = auth.uid()))
  )
$$;

-- O usuário logado supervisiona (principal ou adicional) a pessoa naquele banco?
create or replace function private.supervises(target_profile_id uuid, target_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams as t
    join public.team_members as m on m.team_id = t.id and m.module = t.module
    where t.module = target_module
      and t.active = true
      and m.active = true
      and m.profile_id = target_profile_id
      and (t.supervisor_id = auth.uid()
           or exists (select 1 from public.team_supervisors as ts where ts.team_id = t.id and ts.profile_id = auth.uid()))
  )
$$;

alter table public.team_supervisors enable row level security;
revoke all privileges on table public.team_supervisors from public, anon, authenticated;
grant select on table public.team_supervisors to authenticated;
grant all privileges on table public.team_supervisors to service_role;

drop policy if exists team_supervisors_select on public.team_supervisors;
create policy team_supervisors_select on public.team_supervisors for select to authenticated
using (
  profile_id = auth.uid()
  or private.module_role(module) = 'diretor'
  or private.is_team_supervisor(team_id)
  or private.is_active_team_member(team_id)
);

drop policy if exists teams_select_visible on public.teams;
create policy teams_select_visible on public.teams for select to authenticated
using (
  private.module_role(module) = 'diretor'
  or supervisor_id = auth.uid()
  or private.is_team_supervisor(id)
  or private.is_active_team_member(id)
);

-- Pessoas visíveis: supervisor adicional também vê a equipe; supervisor_name lista todos os supervisores.
create or replace function public.banco1_people()
returns table (
  id uuid,
  full_name text,
  email text,
  module_role text,
  team_id uuid,
  team_name text,
  supervisor_id uuid,
  supervisor_name text,
  job_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select private.module_role('BANCO_1') as role
  ),
  people as (
    select p.id, p.full_name, p.email, coalesce(a.role, p.role)::text as module_role, p.job_title
    from public.profiles as p
    join public.profile_module_access as a on a.profile_id = p.id and a.module = 'BANCO_1' and a.active
    where p.active
  )
  select pe.id, pe.full_name, pe.email, pe.module_role,
         t.id, t.name, t.supervisor_id,
         nullif(concat_ws(', ',
           nullif(btrim(sp.full_name), ''),
           (select string_agg(nullif(btrim(cp.full_name), ''), ', ' order by cp.full_name)
              from public.team_supervisors as ts join public.profiles as cp on cp.id = ts.profile_id
             where ts.team_id = t.id)
         ), ''),
         pe.job_title
  from people as pe
  cross join caller as c
  left join public.team_members as m on m.profile_id = pe.id and m.module = 'BANCO_1' and m.active
  left join public.teams as t on t.id = m.team_id and t.active
  left join public.profiles as sp on sp.id = t.supervisor_id
  where c.role is not null
    and (
      pe.id = auth.uid()
      or c.role = 'diretor'
      or (c.role = 'supervisor' and t.id is not null and private.is_team_supervisor(t.id))
    )
  order by pe.full_name nulls last, pe.email
$$;

-- banco1_save_team com supervisores adicionais (a versão antiga, de 4 parâmetros, sai para não haver ambiguidade).
drop function if exists public.banco1_save_team(uuid, text, uuid, uuid[]);
drop function if exists public.banco1_save_team(uuid, text, uuid, uuid[], uuid[]);

create function public.banco1_save_team(
  team_id uuid,
  team_name text,
  supervisor uuid,
  member_ids uuid[] default '{}',
  co_supervisor_ids uuid[] default '{}'
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
  co_supervisors uuid[] := coalesce(co_supervisor_ids, '{}');
  co_supervisor uuid;
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

  -- Supervisores adicionais: sem repetição, sem o principal, com acesso ativo ao Banco 1.
  co_supervisors := array(select distinct c from unnest(co_supervisors) as c where c is not null and c <> supervisor);
  select count(*) into invalid_count
  from unnest(co_supervisors) as c
  where not exists (
    select 1 from public.profiles as p
    join public.profile_module_access as a on a.profile_id = p.id and a.module = 'BANCO_1' and a.active
    where p.id = c and p.active
  );
  if invalid_count > 0 then
    raise exception 'Há supervisor adicional sem acesso ativo ao Banco 1.' using errcode = '22023';
  end if;
  -- Quem é supervisor adicional e estava como colaborador no Banco 1 passa a supervisor.
  update public.profile_module_access as a set role = 'supervisor'
  where a.module = 'BANCO_1' and a.profile_id = any(co_supervisors)
    and coalesce(a.role, (select p.role::text from public.profiles as p where p.id = a.profile_id)) = 'colaborador';

  -- Colaboradores: sem repetição, sem supervisores e todos com acesso ativo ao Banco 1.
  members := array(select distinct m from unnest(members) as m where m is not null and m <> supervisor and not (m = any(co_supervisors)));
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

  -- Supervisores adicionais: substitui a lista atual.
  delete from public.team_supervisors as ts where ts.team_id = target_id and not (ts.profile_id = any(co_supervisors));
  foreach co_supervisor in array co_supervisors loop
    insert into public.team_supervisors (team_id, module, profile_id) values (target_id, 'BANCO_1', co_supervisor)
    on conflict on constraint team_supervisors_pkey do nothing;
  end loop;

  -- Supervisores não ficam como membros da própria equipe.
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

comment on function public.banco1_save_team(uuid, text, uuid, uuid[], uuid[]) is 'Diretoria: cria/edita supervisão do Banco 1 com supervisor principal, supervisores adicionais e colaboradores.';

revoke all privileges on function public.banco1_save_team(uuid, text, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.banco1_save_team(uuid, text, uuid, uuid[], uuid[]) to authenticated;
revoke all privileges on function private.is_team_supervisor(uuid) from public, anon;
grant execute on function private.is_team_supervisor(uuid) to authenticated;
revoke all privileges on function private.supervises(uuid, text) from public, anon;
grant execute on function private.supervises(uuid, text) to authenticated;
revoke all privileges on function public.banco1_people() from public, anon;
grant execute on function public.banco1_people() to authenticated;

commit;

notify pgrst, 'reload schema';
