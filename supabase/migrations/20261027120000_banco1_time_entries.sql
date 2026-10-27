begin;

-- =====================================================================
-- Banco 1 no Supabase — Etapa 1: equipes e apontamentos
-- * Equipes por banco (supervisor + membros), geridas por SQL pela Administração.
-- * Apontamentos do Banco 1 com RLS:
--     colaborador cria/edita/cancela os próprios;
--     supervisor vê e decide os da sua equipe; diretoria vê e decide todos.
-- * Decisões (aprovar/rejeitar) só pela função banco1_decide_time_entries.
-- * banco1_people(): nomes das pessoas que o usuário pode ver (a RLS de
--   profiles só libera o próprio perfil).
-- Pré-requisito: 20261025120000_profile_module_access.sql aplicada.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

do $$
begin
  if to_regclass('public.profile_module_access') is null then
    raise exception 'Aplique antes a migration 20261025120000_profile_module_access.sql.';
  end if;
end;
$$;

create schema if not exists private;

-- ---------------------------------------------------------------------
-- Cargo do usuário logado em um banco (cargo do acesso ou, se vazio, o do perfil).
-- Null = sem perfil ativo ou sem acesso ativo àquele banco.
-- ---------------------------------------------------------------------
create or replace function private.module_role(target_module text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(a.role, p.role)::text
  from public.profiles as p
  join public.profile_module_access as a on a.profile_id = p.id
  where p.id = auth.uid()
    and p.active = true
    and a.module = target_module
    and a.active = true
  limit 1
$$;

-- ---------------------------------------------------------------------
-- Equipes
-- ---------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('BANCO_1', 'BANCO_2')),
  name text not null check (length(btrim(name)) between 1 and 120),
  supervisor_id uuid references public.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, module),
  unique (module, name)
);

create table if not exists public.team_members (
  team_id uuid not null,
  module text not null check (module in ('BANCO_1', 'BANCO_2')),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (team_id, profile_id),
  foreign key (team_id, module) references public.teams(id, module) on delete cascade
);

-- Cada pessoa fica em no máximo UMA equipe ativa por banco.
create unique index if not exists team_members_one_active_team_per_module
  on public.team_members (profile_id, module) where active;
create index if not exists teams_supervisor_idx on public.teams (supervisor_id) where active;

comment on table public.teams is 'Equipes por banco do Ecossistema. Gerenciadas pela Administração (SQL por enquanto).';
comment on table public.team_members is 'Membros das equipes. Uma equipe ativa por pessoa e por banco.';

-- O usuário logado supervisiona (equipe ativa) a pessoa informada naquele banco?
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
      and t.supervisor_id = auth.uid()
      and m.profile_id = target_profile_id
  )
$$;

-- Equipe ativa de uma pessoa num banco.
create or replace function private.active_team_id(target_profile_id uuid, target_module text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.team_id
  from public.team_members as m
  join public.teams as t on t.id = m.team_id
  where m.profile_id = target_profile_id and m.module = target_module and m.active and t.active
  limit 1
$$;

-- Funções auxiliares (security definer) evitam recursão entre as políticas de teams e team_members.
create or replace function private.is_active_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members as m where m.team_id = target_team_id and m.profile_id = auth.uid() and m.active)
$$;

create or replace function private.is_team_supervisor(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teams as t where t.id = target_team_id and t.supervisor_id = auth.uid() and t.active)
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
revoke all privileges on table public.teams, public.team_members from public, anon, authenticated;
grant select on table public.teams, public.team_members to authenticated;
grant select, insert, update, delete on table public.teams, public.team_members to service_role;

drop policy if exists teams_select_visible on public.teams;
create policy teams_select_visible on public.teams for select to authenticated
using (
  private.module_role(module) = 'diretor'
  or supervisor_id = auth.uid()
  or private.is_active_team_member(id)
);

drop policy if exists team_members_select_visible on public.team_members;
create policy team_members_select_visible on public.team_members for select to authenticated
using (
  profile_id = auth.uid()
  or private.module_role(module) = 'diretor'
  or private.is_team_supervisor(team_id)
);

-- ---------------------------------------------------------------------
-- Apontamentos do Banco 1 (espelha o tipo TimeEntry do frontend)
-- ---------------------------------------------------------------------
create table if not exists public.banco1_time_entries (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.profiles(id) on delete restrict,
  entry_date date not null,
  client_name text not null check (length(btrim(client_name)) between 1 and 160),
  project_code text not null check (length(btrim(project_code)) between 1 and 80),
  contractor_number text check (contractor_number is null or length(contractor_number) <= 160),
  ld_document jsonb check (ld_document is null or jsonb_typeof(ld_document) = 'object'),
  activity_id text not null check (length(activity_id) between 1 and 80),
  discipline_code text not null check (discipline_code in ('—', 'A', 'E', 'G', 'M')),
  document_type_code text not null check (length(document_type_code) between 1 and 20),
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
  details text not null default '' check (length(details) <= 4000),
  team_id uuid references public.teams(id) on delete set null,
  assignment_snapshot jsonb,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'CANCELLED')),
  version integer not null default 1 check (version >= 1),
  last_edit_reason text check (last_edit_reason is null or length(last_edit_reason) <= 500),
  source_entry_id uuid references public.banco1_time_entries(id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 500),
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 500),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  offline_sync_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banco1_time_entries_cancel_consistent check ((status = 'CANCELLED') = (cancelled_at is not null)),
  constraint banco1_time_entries_rejection_reason check (status <> 'REJECTED' or length(btrim(coalesce(rejection_reason, ''))) > 0)
);

create index if not exists banco1_time_entries_collaborator_date_idx on public.banco1_time_entries (collaborator_id, entry_date);
create index if not exists banco1_time_entries_team_date_idx on public.banco1_time_entries (team_id, entry_date);
create index if not exists banco1_time_entries_date_idx on public.banco1_time_entries (entry_date);

comment on table public.banco1_time_entries is 'Apontamentos do Banco 1. Edição incrementa version (concorrência otimista); cancelamento em vez de exclusão; decisões só por banco1_decide_time_entries.';

-- Regras que o navegador não pode burlar: dono fixo, versão, datas e decisões controladas pelo banco.
create or replace function private.banco1_time_entries_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_decision boolean := coalesce(current_setting('banco1.decision', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
    new.cancelled_at := null;
    new.cancel_reason := null;
    new.rejection_reason := null;
    new.decided_at := null;
    new.decided_by := null;
    if new.status not in ('ACTIVE', 'PENDING') then
      raise exception 'Apontamento novo deve começar pendente.' using errcode = 'check_violation';
    end if;
    -- Equipe sempre definida pelo banco (equipe ativa da pessoa), nunca pelo navegador.
    new.team_id := private.active_team_id(new.collaborator_id, 'BANCO_1');
    return new;
  end if;

  -- UPDATE
  if new.collaborator_id <> old.collaborator_id or new.created_at <> old.created_at or new.id <> old.id
     or new.offline_sync_id is distinct from old.offline_sync_id or new.source_entry_id is distinct from old.source_entry_id then
    raise exception 'Não é permitido alterar dono, id ou origem do apontamento.' using errcode = 'check_violation';
  end if;
  if old.status = 'CANCELLED' then
    raise exception 'Apontamento cancelado não pode ser alterado.' using errcode = 'check_violation';
  end if;
  new.team_id := old.team_id;

  if is_decision then
    -- Caminho da função banco1_decide_time_entries: só a decisão muda.
    new.cancelled_at := old.cancelled_at;
    new.cancel_reason := old.cancel_reason;
  else
    -- Caminho do colaborador: decisão é sempre a que está no banco.
    if old.status = 'APPROVED' then
      raise exception 'Apontamento aprovado não pode ser alterado.' using errcode = 'check_violation';
    end if;
    new.decided_at := old.decided_at;
    new.decided_by := old.decided_by;
    new.rejection_reason := old.rejection_reason;
    if new.status = 'CANCELLED' then
      if length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
        raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
      end if;
      new.cancelled_at := now();
    elsif new.status is distinct from old.status then
      raise exception 'O status do apontamento só muda por cancelamento ou decisão da supervisão.' using errcode = 'check_violation';
    else
      new.cancelled_at := null;
      new.cancel_reason := null;
      -- Corrigiu um apontamento rejeitado: volta para análise.
      if old.status = 'REJECTED' then
        new.status := 'PENDING';
        new.rejection_reason := null;
        new.decided_at := null;
        new.decided_by := null;
      end if;
    end if;
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists banco1_time_entries_guard on public.banco1_time_entries;
create trigger banco1_time_entries_guard
before insert or update on public.banco1_time_entries
for each row execute function private.banco1_time_entries_guard();

alter table public.banco1_time_entries enable row level security;
revoke all privileges on table public.banco1_time_entries from public, anon, authenticated;
grant select, insert, update on table public.banco1_time_entries to authenticated;
grant select, insert, update, delete on table public.banco1_time_entries to service_role;

drop policy if exists banco1_time_entries_select on public.banco1_time_entries;
create policy banco1_time_entries_select on public.banco1_time_entries for select to authenticated
using (
  (collaborator_id = auth.uid() and private.module_role('BANCO_1') is not null)
  or private.module_role('BANCO_1') = 'diretor'
  or (private.module_role('BANCO_1') = 'supervisor' and private.supervises(collaborator_id, 'BANCO_1'))
);

drop policy if exists banco1_time_entries_insert_own on public.banco1_time_entries;
create policy banco1_time_entries_insert_own on public.banco1_time_entries for insert to authenticated
with check (collaborator_id = auth.uid() and private.module_role('BANCO_1') is not null);

drop policy if exists banco1_time_entries_update_own on public.banco1_time_entries;
create policy banco1_time_entries_update_own on public.banco1_time_entries for update to authenticated
using (collaborator_id = auth.uid() and private.module_role('BANCO_1') is not null and status not in ('APPROVED', 'CANCELLED'))
with check (collaborator_id = auth.uid());

-- ---------------------------------------------------------------------
-- Decisão da supervisão / diretoria
-- ---------------------------------------------------------------------
create or replace function public.banco1_decide_time_entries(entry_ids uuid[], decision text, reason text default null)
returns setof public.banco1_time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := private.module_role('BANCO_1');
  target public.banco1_time_entries;
  clean_reason text := nullif(btrim(coalesce(reason, '')), '');
begin
  if caller_role is null or caller_role not in ('supervisor', 'diretor') then
    raise exception 'Somente supervisão ou diretoria podem decidir apontamentos.' using errcode = '42501';
  end if;
  if decision not in ('APPROVED', 'REJECTED') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  if decision = 'REJECTED' and clean_reason is null then
    raise exception 'Informe o motivo da rejeição.' using errcode = '22023';
  end if;
  if entry_ids is null or cardinality(entry_ids) = 0 then
    return;
  end if;

  perform set_config('banco1.decision', 'on', true);

  for target in
    select * from public.banco1_time_entries where id = any(entry_ids) order by id for update
  loop
    if caller_role = 'supervisor' and not private.supervises(target.collaborator_id, 'BANCO_1') then
      raise exception 'Apontamento fora da sua equipe.' using errcode = '42501';
    end if;
    if target.status = 'CANCELLED' then
      raise exception 'Apontamento cancelado não pode ser decidido.' using errcode = 'check_violation';
    end if;
    return query
      update public.banco1_time_entries
      set status = decision,
          rejection_reason = case when decision = 'REJECTED' then clean_reason else null end,
          decided_at = now(),
          decided_by = auth.uid()
      where id = target.id
      returning *;
  end loop;

  perform set_config('banco1.decision', '', true);
end;
$$;

comment on function public.banco1_decide_time_entries(uuid[], text, text) is 'Aprova/rejeita apontamentos do Banco 1. Supervisor: só da equipe; diretoria: todos.';

-- ---------------------------------------------------------------------
-- Pessoas visíveis ao usuário no Banco 1 (com equipe e supervisor)
-- ---------------------------------------------------------------------
create or replace function public.banco1_people()
returns table (
  id uuid,
  full_name text,
  email text,
  module_role text,
  team_id uuid,
  team_name text,
  supervisor_id uuid,
  supervisor_name text
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
    select p.id, p.full_name, p.email, coalesce(a.role, p.role)::text as module_role
    from public.profiles as p
    join public.profile_module_access as a on a.profile_id = p.id and a.module = 'BANCO_1' and a.active
    where p.active
  )
  select pe.id, pe.full_name, pe.email, pe.module_role,
         t.id, t.name, t.supervisor_id, sp.full_name
  from people as pe
  cross join caller as c
  left join public.team_members as m on m.profile_id = pe.id and m.module = 'BANCO_1' and m.active
  left join public.teams as t on t.id = m.team_id and t.active
  left join public.profiles as sp on sp.id = t.supervisor_id
  where c.role is not null
    and (
      pe.id = auth.uid()
      or c.role = 'diretor'
      or (c.role = 'supervisor' and t.supervisor_id = auth.uid())
    )
  order by pe.full_name nulls last, pe.email
$$;

comment on function public.banco1_people() is 'Pessoas do Banco 1 que o usuário pode ver: ele mesmo; supervisor vê a equipe; diretoria vê todos.';

-- ---------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------
revoke all privileges on function private.module_role(text) from public, anon;
revoke all privileges on function private.supervises(uuid, text) from public, anon;
revoke all privileges on function private.active_team_id(uuid, text) from public, anon, authenticated;
revoke all privileges on function private.banco1_time_entries_guard() from public, anon, authenticated;
revoke all privileges on function private.is_active_team_member(uuid) from public, anon;
revoke all privileges on function private.is_team_supervisor(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.module_role(text) to authenticated;
grant execute on function private.supervises(uuid, text) to authenticated;
grant execute on function private.is_active_team_member(uuid) to authenticated;
grant execute on function private.is_team_supervisor(uuid) to authenticated;

revoke all privileges on function public.banco1_decide_time_entries(uuid[], text, text) from public, anon;
revoke all privileges on function public.banco1_people() from public, anon;
grant execute on function public.banco1_decide_time_entries(uuid[], text, text) to authenticated;
grant execute on function public.banco1_people() to authenticated;

commit;

notify pgrst, 'reload schema';
