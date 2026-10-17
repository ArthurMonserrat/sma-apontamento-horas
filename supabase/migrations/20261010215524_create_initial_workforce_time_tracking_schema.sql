
create type public.app_role as enum ('colaborador', 'supervisor', 'diretor');
create type public.time_entry_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.approval_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null unique,
  full_name text not null,
  role public.app_role not null,
  squad_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (length(btrim(email)) > 0),
  constraint profiles_full_name_not_blank check (length(btrim(full_name)) > 0)
);

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supervisor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint squads_name_not_blank check (length(btrim(name)) > 0),
  constraint squads_supervisor_unique unique (supervisor_id)
);

alter table public.profiles
  add constraint profiles_squad_id_fkey
  foreign key (squad_id) references public.squads(id) on delete restrict;

create table public.workloads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  daily_minutes_target integer not null,
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  constraint workloads_daily_minutes_positive check (daily_minutes_target > 0 and daily_minutes_target <= 1440),
  constraint workloads_valid_range check (valid_to is null or valid_to >= valid_from)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  date date not null,
  start_time time not null,
  end_time time not null,
  duration_minutes integer not null,
  project_code text not null,
  description text,
  status public.time_entry_status not null default 'pending',
  version integer not null default 1,
  cancel_reason text,
  offline_sync_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_duration_nonnegative check (duration_minutes >= 0),
  constraint time_entries_version_positive check (version > 0),
  constraint time_entries_project_code_not_blank check (length(btrim(project_code)) > 0),
  constraint time_entries_end_after_start check (end_time > start_time),
  constraint time_entries_cancel_reason_required check (
    status <> 'cancelled' or length(btrim(coalesce(cancel_reason, ''))) > 0
  )
);

create table public.daily_approvals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  date date not null,
  status public.approval_status not null default 'pending',
  supervisor_id uuid references public.profiles(id) on delete restrict,
  version_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_approvals_version_hash_not_blank check (length(btrim(version_hash)) > 0),
  constraint daily_approvals_approved_by_supervisor check (
    status <> 'approved' or supervisor_id is not null
  ),
  constraint daily_approvals_unique_day unique (profile_id, date)
);

create index profiles_squad_id_idx on public.profiles (squad_id);
create index workloads_profile_validity_idx on public.workloads (profile_id, valid_from, valid_to);
create index time_entries_profile_date_idx on public.time_entries (profile_id, date);
create index time_entries_status_idx on public.time_entries (status);
create index daily_approvals_profile_date_idx on public.daily_approvals (profile_id, date);
create index daily_approvals_supervisor_idx on public.daily_approvals (supervisor_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger time_entries_set_updated_at
before update on public.time_entries
for each row execute function public.set_updated_at();

create trigger daily_approvals_set_updated_at
before update on public.daily_approvals
for each row execute function public.set_updated_at();

create schema if not exists private;

create or replace function private.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.active = true
  limit 1
$$;

create or replace function private.current_profile_squad_id()
returns uuid
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select p.squad_id
  from public.profiles p
  where p.id = auth.uid()
    and p.active = true
  limit 1
$$;

create or replace function private.is_in_current_squad(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_profile_id
      and p.squad_id = private.current_profile_squad_id()
  )
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.current_profile_role() from public;
revoke all on function private.current_profile_squad_id() from public;
revoke all on function private.is_in_current_squad(uuid) from public;
grant execute on function private.current_profile_role() to authenticated;
grant execute on function private.current_profile_squad_id() to authenticated;
grant execute on function private.is_in_current_squad(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.squads enable row level security;
alter table public.workloads enable row level security;
alter table public.time_entries enable row level security;
alter table public.daily_approvals enable row level security;

revoke all on all tables in schema public from anon;
grant select on public.profiles, public.squads, public.workloads, public.time_entries, public.daily_approvals to authenticated;
grant insert, update on public.time_entries to authenticated;
grant insert on public.daily_approvals to authenticated;

create policy profiles_select_own
on public.profiles for select to authenticated
using (id = auth.uid());

create policy profiles_select_supervisor_team
on public.profiles for select to authenticated
using (
  private.current_profile_role() = 'supervisor'
  and squad_id = private.current_profile_squad_id()
);

create policy profiles_select_director
on public.profiles for select to authenticated
using (private.current_profile_role() = 'diretor');

create policy squads_select_member
on public.squads for select to authenticated
using (
  id = private.current_profile_squad_id()
  or supervisor_id = auth.uid()
  or private.current_profile_role() = 'diretor'
);

create policy workloads_select_own
on public.workloads for select to authenticated
using (profile_id = auth.uid());

create policy workloads_select_supervisor_team
on public.workloads for select to authenticated
using (
  private.current_profile_role() = 'supervisor'
  and private.is_in_current_squad(profile_id)
);

create policy workloads_select_director
on public.workloads for select to authenticated
using (private.current_profile_role() = 'diretor');

create policy time_entries_select_own
on public.time_entries for select to authenticated
using (profile_id = auth.uid());

create policy time_entries_insert_own
on public.time_entries for insert to authenticated
with check (
  profile_id = auth.uid()
  and status = 'pending'
);

create policy time_entries_update_own_unapproved_day
on public.time_entries for update to authenticated
using (
  profile_id = auth.uid()
  and not exists (
    select 1
    from public.daily_approvals a
    where a.profile_id = time_entries.profile_id
      and a.date = time_entries.date
      and a.status = 'approved'
  )
)
with check (
  profile_id = auth.uid()
  and status <> 'approved'
  and not exists (
    select 1
    from public.daily_approvals a
    where a.profile_id = time_entries.profile_id
      and a.date = time_entries.date
      and a.status = 'approved'
  )
);

create policy time_entries_select_supervisor_team
on public.time_entries for select to authenticated
using (
  private.current_profile_role() = 'supervisor'
  and private.is_in_current_squad(profile_id)
);

create policy time_entries_update_supervisor_team
on public.time_entries for update to authenticated
using (
  private.current_profile_role() = 'supervisor'
  and private.is_in_current_squad(profile_id)
)
with check (
  private.current_profile_role() = 'supervisor'
  and private.is_in_current_squad(profile_id)
);

create policy time_entries_select_director
on public.time_entries for select to authenticated
using (private.current_profile_role() = 'diretor');

create policy daily_approvals_select_own
on public.daily_approvals for select to authenticated
using (profile_id = auth.uid());

create policy daily_approvals_select_supervisor_team
on public.daily_approvals for select to authenticated
using (
  private.current_profile_role() = 'supervisor'
  and private.is_in_current_squad(profile_id)
);

create policy daily_approvals_insert_supervisor_team
on public.daily_approvals for insert to authenticated
with check (
  private.current_profile_role() = 'supervisor'
  and private.is_in_current_squad(profile_id)
  and supervisor_id = auth.uid()
);

create policy daily_approvals_select_director
on public.daily_approvals for select to authenticated
using (private.current_profile_role() = 'diretor');

comment on table public.profiles is 'Perfil corporativo vinculado 1:1 à identidade auth.users; role não é inferido do cliente.';
comment on table public.squads is 'Organograma por IDs, evitando regras de equipe baseadas em nomes.';
comment on table public.workloads is 'Vigências de carga horária usadas no cálculo de saldo; não editar saldo manualmente.';
comment on table public.time_entries is 'Apontamentos com cancelamento lógico, versionamento e idempotência offline.';
comment on table public.daily_approvals is 'Autoridade única de aprovação por colaborador e dia.';
comment on function private.current_profile_role() is 'Helper privado para RLS; não expõe autorização via user metadata.';
comment on function private.current_profile_squad_id() is 'Helper privado para escopo de equipe em RLS.';
