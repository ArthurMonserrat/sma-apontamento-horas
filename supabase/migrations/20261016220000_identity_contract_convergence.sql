begin;

do $$
declare
  role_udt text;
begin
  select udt_name into role_udt
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'role';

  if role_udt = 'text' then
    if exists (select 1 from public.profiles where role not in ('colaborador', 'supervisor', 'diretor')) then
      raise exception 'profiles.role contains values outside app_role';
    end if;
    alter table public.profiles drop constraint if exists profiles_role_check;
    alter table public.profiles alter column role drop default;
    alter table public.profiles alter column role type public.app_role using role::public.app_role;
    alter table public.profiles alter column role set default 'colaborador'::public.app_role;
  elsif role_udt <> 'app_role' then
    raise exception 'incompatible profiles.role type: %', role_udt;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check check (role in ('colaborador', 'supervisor', 'diretor')) not valid;
  end if;
end
$$;

create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.active = true
  limit 1
$$;

create or replace function private.current_profile_role()
returns app_role
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select p.role::app_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
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
  where p.auth_user_id = auth.uid()
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
      and p.active = true
      and p.squad_id = private.current_profile_squad_id()
  )
$$;

revoke execute on function private.current_profile_id() from public, anon;
revoke execute on function private.current_profile_role() from public, anon;
revoke execute on function private.current_profile_squad_id() from public, anon;
revoke execute on function private.is_in_current_squad(uuid) from public, anon;
grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.current_profile_role() to authenticated;
grant execute on function private.current_profile_squad_id() to authenticated;
grant execute on function private.is_in_current_squad(uuid) to authenticated;

-- Direct profile writes are not an authorization path. Future provisioning is
-- server-side and must use a reviewed transaction, not table grants.
revoke insert, update, delete on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
revoke all on table public.access_preapprovals from public, anon, authenticated;
revoke all on all tables in schema public from anon;
grant select on public.profiles, public.squads, public.workloads, public.time_entries, public.daily_approvals to authenticated;
grant insert, update on public.time_entries to authenticated;
grant insert on public.daily_approvals to authenticated;

alter table public.profiles enable row level security;
alter table public.squads enable row level security;
alter table public.workloads enable row level security;
alter table public.time_entries enable row level security;
alter table public.daily_approvals enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
using (id = private.current_profile_id());
drop policy if exists profiles_select_supervisor_team on public.profiles;
create policy profiles_select_supervisor_team on public.profiles for select to authenticated
using (private.current_profile_role() = 'supervisor' and squad_id = private.current_profile_squad_id());
drop policy if exists profiles_select_director on public.profiles;
create policy profiles_select_director on public.profiles for select to authenticated
using (private.current_profile_role() = 'diretor');

drop policy if exists squads_select_member on public.squads;
create policy squads_select_member on public.squads for select to authenticated
using (id = private.current_profile_squad_id() or supervisor_id = private.current_profile_id() or private.current_profile_role() = 'diretor');

drop policy if exists workloads_select_own on public.workloads;
create policy workloads_select_own on public.workloads for select to authenticated
using (profile_id = private.current_profile_id());
drop policy if exists workloads_select_supervisor_team on public.workloads;
create policy workloads_select_supervisor_team on public.workloads for select to authenticated
using (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id));
drop policy if exists workloads_select_director on public.workloads;
create policy workloads_select_director on public.workloads for select to authenticated
using (private.current_profile_role() = 'diretor');

drop policy if exists time_entries_select_own on public.time_entries;
create policy time_entries_select_own on public.time_entries for select to authenticated
using (profile_id = private.current_profile_id());
drop policy if exists time_entries_insert_own on public.time_entries;
create policy time_entries_insert_own on public.time_entries for insert to authenticated
with check (profile_id = private.current_profile_id() and status = 'pending');
drop policy if exists time_entries_update_own_unapproved_day on public.time_entries;
create policy time_entries_update_own_unapproved_day on public.time_entries for update to authenticated
using (profile_id = private.current_profile_id() and not exists (select 1 from public.daily_approvals a where a.profile_id = time_entries.profile_id and a.date = time_entries.date and a.status = 'approved'))
with check (profile_id = private.current_profile_id() and status <> 'approved' and not exists (select 1 from public.daily_approvals a where a.profile_id = time_entries.profile_id and a.date = time_entries.date and a.status = 'approved'));
drop policy if exists time_entries_select_supervisor_team on public.time_entries;
create policy time_entries_select_supervisor_team on public.time_entries for select to authenticated
using (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id));
drop policy if exists time_entries_update_supervisor_team on public.time_entries;
create policy time_entries_update_supervisor_team on public.time_entries for update to authenticated
using (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id))
with check (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id));
drop policy if exists time_entries_select_director on public.time_entries;
create policy time_entries_select_director on public.time_entries for select to authenticated
using (private.current_profile_role() = 'diretor');

drop policy if exists daily_approvals_select_own on public.daily_approvals;
create policy daily_approvals_select_own on public.daily_approvals for select to authenticated
using (profile_id = private.current_profile_id());
drop policy if exists daily_approvals_select_supervisor_team on public.daily_approvals;
create policy daily_approvals_select_supervisor_team on public.daily_approvals for select to authenticated
using (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id));
drop policy if exists daily_approvals_insert_supervisor_team on public.daily_approvals;
create policy daily_approvals_insert_supervisor_team on public.daily_approvals for insert to authenticated
with check (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id) and supervisor_id = private.current_profile_id());
drop policy if exists daily_approvals_select_director on public.daily_approvals;
create policy daily_approvals_select_director on public.daily_approvals for select to authenticated
using (private.current_profile_role() = 'diretor');

alter table public.profiles validate constraint profiles_auth_user_id_fkey;
alter table public.profiles validate constraint profiles_squad_id_fkey;
alter table public.profiles validate constraint profiles_identity_pair_check;
alter table public.profiles validate constraint profiles_role_check;
alter table public.access_preapprovals validate constraint access_preapprovals_identity_pair_check;

commit;
