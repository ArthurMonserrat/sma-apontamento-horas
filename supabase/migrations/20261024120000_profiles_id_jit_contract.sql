begin;

-- Abort before changing anything unless public.profiles matches the identity
-- contract reported for production: profiles.id is auth.users.id.
do $$
declare
  missing_columns text[];
  unexpected_columns text[];
  id_attnum smallint;
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Expected schema public.profiles is missing; no identity migration was applied.';
  end if;

  if to_regclass('auth.users') is null then
    raise exception 'Expected Supabase auth.users is missing; no identity migration was applied.';
  end if;

  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from (values ('id'), ('email'), ('full_name'), ('role'), ('active')) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Unexpected public.profiles schema: required columns are missing: %.', array_to_string(missing_columns, ', ');
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'id' and udt_name <> 'uuid'
  ) then
    raise exception 'Unexpected public.profiles schema: profiles.id must be uuid primary key references auth.users(id).';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'role' and udt_name <> 'app_role'
  ) then
    raise exception 'Unexpected public.profiles schema: profiles.role must use public.app_role.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'active' and udt_name <> 'bool'
  ) then
    raise exception 'Unexpected public.profiles schema: profiles.active must be boolean.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('email', 'full_name') and udt_name <> 'text'
  ) then
    raise exception 'Unexpected public.profiles schema: profiles.email and profiles.full_name must be text.';
  end if;

  select a.attnum into id_attnum
  from pg_attribute as a
  where a.attrelid = 'public.profiles'::regclass and a.attname = 'id' and not a.attisdropped;

  if not exists (
    select 1 from pg_constraint as c
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'p'
      and c.conkey = array[id_attnum]::smallint[]
  ) then
    raise exception 'Unexpected public.profiles schema: profiles.id must be the primary key.';
  end if;

  if not exists (
    select 1 from pg_constraint as c
    where c.conrelid = 'public.profiles'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.contype = 'f'
      and c.conkey = array[id_attnum]::smallint[]
      and c.confkey = array[(select a.attnum from pg_attribute as a where a.attrelid = 'auth.users'::regclass and a.attname = 'id' and not a.attisdropped)]::smallint[]
  ) then
    raise exception 'Unexpected public.profiles schema: profiles.id must reference auth.users(id).';
  end if;

  select array_agg(a.attname::text order by a.attname::text)
  into unexpected_columns
  from pg_attribute as a
  left join pg_attrdef as d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.profiles'::regclass
    and a.attnum > 0
    and not a.attisdropped
    and a.attnotnull
    and a.attgenerated = ''
    and a.attidentity = ''
    and d.adbin is null
    and a.attname not in ('id', 'email', 'full_name', 'role', 'active');

  if unexpected_columns is not null then
    raise exception 'Unexpected public.profiles schema: JIT insert has additional required columns: %.', array_to_string(unexpected_columns, ', ');
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

create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles as p
  where p.id = auth.uid()
    and p.active = true
  limit 1
$$;

create or replace function private.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = auth.uid()
    and p.active = true
  limit 1
$$;

-- Production has no profile-to-squad relationship. Keep legacy RLS checks
-- fail-closed until a real membership relation is introduced.
create or replace function private.current_profile_squad_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select null::uuid
$$;

create or replace function private.is_in_current_squad(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false
$$;

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
begin
  select u.* into auth_user
  from auth.users as u
  where u.id = target_auth_user_id;

  if not found or lower(coalesce(auth_user.raw_app_meta_data ->> 'provider', '')) <> 'azure' then
    return;
  end if;

  normalized_email := nullif(lower(btrim(auth_user.email)), '');
  if normalized_email is null or auth_user.email_confirmed_at is null then
    insert into private.corporate_provisioning_audit (auth_user_id, outcome, reason)
    values (
      auth_user.id,
      'denied',
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
    values (
      auth_user.id,
      normalized_email,
      profile_name,
      'colaborador'::public.app_role,
      true
    )
    on conflict (id) do nothing;

    get diagnostics inserted_count = row_count;
  exception when unique_violation then
    insert into private.corporate_provisioning_audit (
      auth_user_id, preapproval_email, outcome, reason
    ) values (
      auth_user.id, normalized_email, 'denied', 'profile_email_collision'
    );
    return;
  end;

  if inserted_count = 1 then
    insert into private.corporate_provisioning_audit (
      auth_user_id, preapproval_email, outcome, reason
    ) values (
      auth_user.id, normalized_email, 'authorized', 'jit_collaborator_created'
    );
  end if;
end;
$$;

create or replace function private.handle_azure_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.provision_azure_collaborator(new.id);
  return new;
end;
$$;

revoke all privileges on function private.provision_azure_collaborator(uuid) from public, anon, authenticated;
revoke all privileges on function private.handle_azure_auth_user_created() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_provision_azure_collaborator on auth.users;
create trigger on_auth_user_created_provision_azure_collaborator
after insert on auth.users
for each row execute function private.handle_azure_auth_user_created();

do $$
declare
  target_user_id uuid;
begin
  for target_user_id in
    select u.id
    from auth.users as u
    where lower(coalesce(u.raw_app_meta_data ->> 'provider', '')) = 'azure'
      and not exists (
        select 1
        from public.profiles as p
        where p.id = u.id
      )
  loop
    perform private.provision_azure_collaborator(target_user_id);
  end loop;
end;
$$;

-- Ensure the service-role BFF can read profiles even when table grants were
-- previously narrowed. This does not expose the key or grant frontend access.
grant select on table public.profiles to service_role;

alter table public.profiles enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.profiles', existing_policy.policyname);
  end loop;
end;
$$;

create policy profiles_select_own on public.profiles for select to authenticated
using (id = auth.uid());

comment on function private.provision_azure_collaborator(uuid) is
  'Idempotently inserts a collaborator for a confirmed Azure identity using profiles.id = auth.users.id; never links by email or changes existing profiles.';
comment on function private.handle_azure_auth_user_created() is
  'Auth trigger wrapper for private Azure collaborator JIT provisioning.';
comment on function private.is_in_current_squad(uuid) is
  'Fail-closed compatibility helper; production profiles do not currently model squad membership.';

commit;
