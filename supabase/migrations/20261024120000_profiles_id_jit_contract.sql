begin;

-- Validate the confirmed production contract before any schema changes.
do $$
declare
  missing_columns text[];
  unexpected_columns text[];
  id_attnum smallint;
  role_type text;
  role_check text;
  enum_role_count integer;
begin
  if to_regclass('public.profiles') is null or to_regclass('auth.users') is null then
    raise exception 'Expected Supabase tables public.profiles and auth.users; no migration changes were applied.';
  end if;

  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from (values ('id'), ('email'), ('full_name'), ('role'), ('active')) as required(column_name)
  where not exists (
    select 1 from information_schema.columns as c
    where c.table_schema = 'public' and c.table_name = 'profiles'
      and c.column_name = required.column_name
  );
  if missing_columns is not null then
    raise exception 'Unexpected public.profiles schema: missing required columns: %.', array_to_string(missing_columns, ', ');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'id' and udt_name <> 'uuid'
  ) then
    raise exception 'Unexpected public.profiles schema: profiles.id must be uuid.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('email', 'full_name') and udt_name <> 'text'
  ) then
    raise exception 'Unexpected public.profiles schema: profiles.email and profiles.full_name must be text.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('email', 'full_name', 'role', 'active') and is_nullable <> 'NO'
  ) then
    raise exception 'Unexpected public.profiles schema: email, full_name, role and active must be NOT NULL.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'active' and udt_name <> 'bool'
  ) then
    raise exception 'Unexpected public.profiles schema: profiles.active must be boolean.';
  end if;

  select udt_name into role_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'role';

  if role_type = 'text' then
    select pg_get_constraintdef(c.oid) into role_check
    from pg_constraint as c
    where c.conrelid = 'public.profiles'::regclass
      and c.conname = 'profiles_role_check'
      and c.contype = 'c';

    if role_check is null
      or position('colaborador' in lower(role_check)) = 0
      or position('supervisor' in lower(role_check)) = 0
      or position('diretor' in lower(role_check)) = 0
      or exists (
        select 1 from public.profiles as p
        where p.role not in ('colaborador', 'supervisor', 'diretor')
      ) then
      raise exception 'Unexpected public.profiles schema: role text must have profiles_role_check for colaborador, supervisor and diretor.';
    end if;
  elsif role_type <> 'app_role' or to_regtype('public.app_role') is null then
    raise exception 'Unexpected public.profiles schema: role must be checked text or public.app_role.';
  else
    select count(distinct e.enumlabel)::integer into enum_role_count
    from pg_type as t
    join pg_namespace as n on n.oid = t.typnamespace
    join pg_enum as e on e.enumtypid = t.oid
    where n.nspname = 'public' and t.typname = 'app_role'
      and e.enumlabel in ('colaborador', 'supervisor', 'diretor');
    if enum_role_count <> 3 then
      raise exception 'Unexpected public.app_role: it must include colaborador, supervisor and diretor.';
    end if;
  end if;

  select a.attnum into id_attnum
  from pg_attribute as a
  where a.attrelid = 'public.profiles'::regclass and a.attname = 'id' and not a.attisdropped;

  if not exists (
    select 1 from pg_constraint as c
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'p' and c.conkey = array[id_attnum]::smallint[]
  ) then
    raise exception 'Unexpected public.profiles schema: profiles.id must be the primary key.';
  end if;

  select array_agg(a.attname::text order by a.attname::text)
  into unexpected_columns
  from pg_attribute as a
  left join pg_attrdef as d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.profiles'::regclass
    and a.attnum > 0 and not a.attisdropped and a.attnotnull
    and a.attgenerated = '' and a.attidentity = '' and d.adbin is null
    and a.attname not in ('id', 'email', 'full_name', 'role', 'active');
  if unexpected_columns is not null then
    raise exception 'Unexpected public.profiles schema: JIT insert has additional required columns: %.', array_to_string(unexpected_columns, ', ');
  end if;
end;
$$;

-- Policy dependencies are checked by name/expression before changing the
-- current_profile_role() return type. Unknown dependents abort for review.
do $$
declare
  unknown_policies text;
begin
  if to_regprocedure('private.current_profile_role()') is not null and exists (
    select 1
    from pg_depend as d
    join pg_policy as policy on d.classid = 'pg_policy'::regclass and d.objid = policy.oid
    where d.refclassid = 'pg_proc'::regclass
      and d.refobjid = to_regprocedure('private.current_profile_role()')
      and policy.polname not in (
        'profiles_select_own', 'profiles_select_supervisor_team', 'profiles_select_director',
        'squads_select_member',
        'workloads_select_own', 'workloads_select_supervisor_team', 'workloads_select_director',
        'time_entries_select_own', 'time_entries_insert_own', 'time_entries_update_own_unapproved_day',
        'time_entries_select_supervisor_team', 'time_entries_update_supervisor_team', 'time_entries_select_director',
        'daily_approvals_select_own', 'daily_approvals_select_supervisor_team',
        'daily_approvals_insert_supervisor_team', 'daily_approvals_select_director'
      )
  ) then
    raise exception 'Unreviewed pg_depend policy dependency on private.current_profile_role(); inspect pg_policies before applying.';
  end if;

  if to_regprocedure('private.current_profile_role()') is not null and exists (
    select 1 from pg_depend as d
    where d.refclassid = 'pg_proc'::regclass
      and d.refobjid = to_regprocedure('private.current_profile_role()')
      and d.classid = 'pg_proc'::regclass
  ) then
    raise exception 'Other functions depend on private.current_profile_role(); review pg_depend before changing its return type.';
  end if;

  select string_agg(format('%I.%I/%I', schemaname, tablename, policyname), ', ')
  into unknown_policies
  from pg_policies
  where (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%current_profile_role%'
    and policyname not in (
      'profiles_select_own', 'profiles_select_supervisor_team', 'profiles_select_director',
      'squads_select_member',
      'workloads_select_own', 'workloads_select_supervisor_team', 'workloads_select_director',
      'time_entries_select_own', 'time_entries_insert_own', 'time_entries_update_own_unapproved_day',
      'time_entries_select_supervisor_team', 'time_entries_update_supervisor_team', 'time_entries_select_director',
      'daily_approvals_select_own', 'daily_approvals_select_supervisor_team',
      'daily_approvals_insert_supervisor_team', 'daily_approvals_select_director'
    );
  if unknown_policies is not null then
    raise exception 'Unreviewed RLS policies depend on private.current_profile_role(): %.', unknown_policies;
  end if;
end;
$$;

create schema if not exists private;

create table if not exists private.corporate_provisioning_audit (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  microsoft_tenant_id uuid,
  microsoft_object_id uuid,
  preapproval_email text,
  outcome text not null check (outcome in ('authorized', 'denied', 'error')),
  reason text,
  created_at timestamptz not null default now()
);
revoke all privileges on table private.corporate_provisioning_audit from public, anon, authenticated;

-- Drop only named policies that may depend on current_profile_role().
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_supervisor_team on public.profiles;
drop policy if exists profiles_select_director on public.profiles;
drop policy if exists squads_select_member on public.squads;
drop policy if exists workloads_select_own on public.workloads;
drop policy if exists workloads_select_supervisor_team on public.workloads;
drop policy if exists workloads_select_director on public.workloads;
drop policy if exists time_entries_select_own on public.time_entries;
drop policy if exists time_entries_insert_own on public.time_entries;
drop policy if exists time_entries_update_own_unapproved_day on public.time_entries;
drop policy if exists time_entries_select_supervisor_team on public.time_entries;
drop policy if exists time_entries_update_supervisor_team on public.time_entries;
drop policy if exists time_entries_select_director on public.time_entries;
drop policy if exists daily_approvals_select_own on public.daily_approvals;
drop policy if exists daily_approvals_select_supervisor_team on public.daily_approvals;
drop policy if exists daily_approvals_insert_supervisor_team on public.daily_approvals;
drop policy if exists daily_approvals_select_director on public.daily_approvals;

create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles as p
  where p.id = auth.uid() and p.active = true
  limit 1
$$;

-- PostgreSQL cannot change a function return type via CREATE OR REPLACE.
-- Known policy dependencies were dropped nominally above and are recreated below.
drop function if exists private.current_profile_role();
create function private.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role::text from public.profiles as p
  where p.id = auth.uid() and p.active = true
  limit 1
$$;

-- The confirmed production schema has no profile-to-squad membership column.
-- Preserve legacy RLS helpers as fail-closed until such a relation is modeled.
create or replace function private.current_profile_squad_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select null::uuid $$;

create or replace function private.is_in_current_squad(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select false $$;

revoke all privileges on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all privileges on function private.current_profile_id() from public, anon, authenticated;
revoke all privileges on function private.current_profile_role() from public, anon, authenticated;
revoke all privileges on function private.current_profile_squad_id() from public, anon, authenticated;
revoke all privileges on function private.is_in_current_squad(uuid) from public, anon, authenticated;
grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.current_profile_role() to authenticated;
grant execute on function private.current_profile_squad_id() to authenticated;
grant execute on function private.is_in_current_squad(uuid) to authenticated;

create or replace function private.provision_azure_collaborator(target_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_user auth.users%rowtype;
  normalized_email text;
  profile_name text;
  inserted_count integer;
  failure_sqlstate text;
begin
  begin
    select u.* into auth_user from auth.users as u where u.id = target_auth_user_id;
    if not found or lower(coalesce(auth_user.raw_app_meta_data ->> 'provider', '')) <> 'azure' then
      return;
    end if;

    normalized_email := nullif(lower(btrim(auth_user.email)), '');
    if normalized_email is null or auth_user.email_confirmed_at is null then
      insert into private.corporate_provisioning_audit (auth_user_id, outcome, reason)
      values (
        auth_user.id, 'denied',
        case when normalized_email is null then 'azure_email_missing' else 'azure_email_unverified' end
      );
      return;
    end if;

    profile_name := coalesce(
      nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(normalized_email, '@', 1), ''),
      'Colaborador'
    );

    begin
      insert into public.profiles (id, email, full_name, role, active)
      values (auth_user.id, normalized_email, profile_name, 'colaborador', true)
      on conflict (id) do nothing;
      get diagnostics inserted_count = row_count;
    exception when unique_violation then
      begin
        insert into private.corporate_provisioning_audit (auth_user_id, preapproval_email, outcome, reason)
        values (auth_user.id, normalized_email, 'denied', 'profile_email_collision');
      exception when others then
        raise warning 'Azure JIT audit write failed for email collision (SQLSTATE %).', SQLSTATE;
      end;
      return;
    end;

    if inserted_count = 1 then
      insert into private.corporate_provisioning_audit (auth_user_id, preapproval_email, outcome, reason)
      values (auth_user.id, normalized_email, 'authorized', 'jit_collaborator_created');
    end if;
  exception
    when others then
      get stacked diagnostics failure_sqlstate = returned_sqlstate;
      begin
        insert into private.corporate_provisioning_audit (auth_user_id, preapproval_email, outcome, reason)
        values (target_auth_user_id, normalized_email, 'error', 'sqlstate:' || failure_sqlstate);
      exception when others then
        raise warning 'Azure JIT audit write failed after provisioning error (SQLSTATE %).', SQLSTATE;
      end;
      return;
  end;
end;
$$;

create or replace function private.handle_azure_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  failure_sqlstate text;
begin
  begin
    perform private.provision_azure_collaborator(new.id);
  exception when others then
    get stacked diagnostics failure_sqlstate = returned_sqlstate;
    raise warning 'Azure JIT trigger suppressed provisioning failure (SQLSTATE %).', failure_sqlstate;
  end;
  return new;
end;
$$;

revoke all privileges on function private.provision_azure_collaborator(uuid) from public, anon, authenticated;
revoke all privileges on function private.handle_azure_auth_user_created() from public, anon, authenticated;

-- Before applying, inspect other auth.users triggers for profile inserts:
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
-- where tgrelid = 'auth.users'::regclass and not tgisinternal;
drop trigger if exists on_auth_user_created_provision_azure_collaborator on auth.users;
create trigger on_auth_user_created_provision_azure_collaborator
after insert on auth.users
for each row execute function private.handle_azure_auth_user_created();

do $$
declare
  target_user_id uuid;
  orphan_count bigint;
  id_attnum smallint;
  auth_id_attnum smallint;
  id_fk_name text;
begin
  for target_user_id in
    select u.id from auth.users as u
    where lower(coalesce(u.raw_app_meta_data ->> 'provider', '')) = 'azure'
      and not exists (select 1 from public.profiles as p where p.id = u.id)
  loop
    perform private.provision_azure_collaborator(target_user_id);
  end loop;

  select count(*) into orphan_count
  from public.profiles as p
  left join auth.users as u on u.id = p.id
  where u.id is null;

  if orphan_count = 0 then
    select a.attnum into id_attnum from pg_attribute as a
      where a.attrelid = 'public.profiles'::regclass and a.attname = 'id' and not a.attisdropped;
    select a.attnum into auth_id_attnum from pg_attribute as a
      where a.attrelid = 'auth.users'::regclass and a.attname = 'id' and not a.attisdropped;

    select c.conname into id_fk_name from pg_constraint as c
    where c.conrelid = 'public.profiles'::regclass and c.confrelid = 'auth.users'::regclass
      and c.contype = 'f' and c.conkey = array[id_attnum]::smallint[]
      and c.confkey = array[auth_id_attnum]::smallint[]
    limit 1;

    if id_fk_name is null then
      id_fk_name := 'profiles_id_auth_users_fkey';
      if exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = id_fk_name) then
        raise exception 'Constraint public.% exists but is not the expected profiles.id -> auth.users.id foreign key.', id_fk_name;
      end if;
      alter table public.profiles
        add constraint profiles_id_auth_users_fkey
        foreign key (id) references auth.users(id) on delete cascade not valid;
    end if;

    execute format('alter table public.profiles validate constraint %I', id_fk_name);
  else
    raise notice 'Skipped profiles.id -> auth.users.id foreign key: % orphan profile row(s) need review.', orphan_count;
  end if;
end;
$$;

-- Recreate all known policies that used current_profile_role(). Team checks
-- remain fail-closed because no employee-to-squad relation exists in production.
create policy profiles_select_own on public.profiles for select to authenticated
using (id = auth.uid());

create policy squads_select_member on public.squads for select to authenticated
using (id = private.current_profile_squad_id() or supervisor_id = private.current_profile_id() or private.current_profile_role() = 'diretor');

create policy workloads_select_own on public.workloads for select to authenticated
using (profile_id = private.current_profile_id());
create policy workloads_select_supervisor_team on public.workloads for select to authenticated
using (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id));
create policy workloads_select_director on public.workloads for select to authenticated
using (private.current_profile_role() = 'diretor');

create policy time_entries_select_own on public.time_entries for select to authenticated
using (profile_id = private.current_profile_id());
create policy time_entries_insert_own on public.time_entries for insert to authenticated
with check (profile_id = private.current_profile_id() and status = 'pending');
create policy time_entries_update_own_unapproved_day on public.time_entries for update to authenticated
using (profile_id = private.current_profile_id() and not exists (
  select 1 from public.daily_approvals as a
  where a.profile_id = time_entries.profile_id and a.date = time_entries.date and a.status = 'approved'
))
with check (profile_id = private.current_profile_id() and status <> 'approved' and not exists (
  select 1 from public.daily_approvals as a
  where a.profile_id = time_entries.profile_id and a.date = time_entries.date and a.status = 'approved'
));
create policy time_entries_select_supervisor_team on public.time_entries for select to authenticated
using (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id));
create policy time_entries_update_supervisor_team on public.time_entries for update to authenticated
using (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id))
with check (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id));
create policy time_entries_select_director on public.time_entries for select to authenticated
using (private.current_profile_role() = 'diretor');

create policy daily_approvals_select_own on public.daily_approvals for select to authenticated
using (profile_id = private.current_profile_id());
create policy daily_approvals_select_supervisor_team on public.daily_approvals for select to authenticated
using (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id));
create policy daily_approvals_insert_supervisor_team on public.daily_approvals for insert to authenticated
with check (private.current_profile_role() = 'supervisor' and private.is_in_current_squad(profile_id) and supervisor_id = private.current_profile_id());
create policy daily_approvals_select_director on public.daily_approvals for select to authenticated
using (private.current_profile_role() = 'diretor');

grant select on public.profiles to service_role;

comment on function private.provision_azure_collaborator(uuid) is
  'Idempotently inserts a collaborator for a confirmed Azure identity using profiles.id = auth.users.id; never links by email or changes existing profiles.';
comment on function private.handle_azure_auth_user_created() is
  'Auth trigger wrapper for private Azure collaborator JIT provisioning; provisioning errors are audited and do not abort auth.users insertion.';

commit;
