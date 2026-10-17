\set ON_ERROR_STOP on

do $$
declare
  legacy_profiles integer;
  legacy_preapprovals integer;
  legacy_auth_user uuid := '00000000-0000-0000-0000-000000000001';
  future_user uuid := '00000000-0000-0000-0000-000000000002';
  squad_id uuid := '20000000-0000-0000-0000-000000000001';
  role_value public.app_role;
  squad_value uuid;
begin
  select count(*) into legacy_profiles from public.profiles;
  select count(*) into legacy_preapprovals from public.access_preapprovals;
  if legacy_profiles <> 2 then raise exception 'legacy profiles changed: %', legacy_profiles; end if;
  if legacy_preapprovals <> 5 then raise exception 'preapprovals changed: %', legacy_preapprovals; end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'auth_user_id') then raise exception 'auth_user_id missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'squad_id') then raise exception 'squad_id missing'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'microsoft_tenant_id') then raise exception 'profile tenant column missing'; end if;

  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profiles_auth_user_id_uidx') then raise exception 'auth user uniqueness index missing'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profiles_microsoft_identity_uidx') then raise exception 'profile identity uniqueness index missing'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'access_preapprovals_microsoft_identity_uidx') then raise exception 'preapproval identity uniqueness index missing'; end if;

  if has_table_privilege('anon', 'private.corporate_provisioning_audit', 'select') then raise exception 'anon can read audit table'; end if;
  if has_table_privilege('authenticated', 'private.corporate_provisioning_audit', 'select') then raise exception 'authenticated can read audit table'; end if;
  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where c.oid = 'private.corporate_provisioning_audit'::regclass
      and acl.grantee = 0
      and acl.privilege_type = 'SELECT'
  ) then raise exception 'PUBLIC can read audit table'; end if;

  if has_function_privilege('anon', 'private.current_profile_role()', 'execute') then raise exception 'anon can execute role function'; end if;
  if has_function_privilege('authenticated', 'private.current_profile_role()', 'execute') is distinct from true then raise exception 'authenticated cannot execute role function'; end if;
  if has_function_privilege('anon', 'private.current_profile_squad_id()', 'execute') then raise exception 'anon can execute squad function'; end if;
  if has_function_privilege('authenticated', 'private.is_in_current_squad(uuid)', 'execute') is distinct from true then raise exception 'authenticated cannot execute squad membership function'; end if;

  -- New rows must obey the identity pair constraint even while the existing
  -- table constraint remains NOT VALID for legacy data.
  begin
    insert into public.access_preapprovals (email, full_name, role, microsoft_tenant_id)
    values ('invalid-pair@example.invalid', 'Invalid Pair', 'colaborador', gen_random_uuid());
    raise exception 'inconsistent identity pair was accepted';
  exception when check_violation then
    null;
  end;

  perform set_config('request.jwt.claim.sub', legacy_auth_user::text, false);
  if private.current_profile_role() is not null then raise exception 'legacy profile linked implicitly by email'; end if;
  if private.current_profile_squad_id() is not null then raise exception 'legacy profile has implicit squad'; end if;

  insert into auth.users (id, email) values (future_user, 'future@example.invalid');
  insert into public.squads (id, name, supervisor_id) values (squad_id, 'Synthetic Squad', future_user);
  insert into public.profiles (id, email, full_name, role, active, squad_id)
  values (future_user, 'future@example.invalid', 'Future Supervisor', 'supervisor', true, squad_id);

  perform set_config('request.jwt.claim.sub', future_user::text, false);
  role_value := private.current_profile_role();
  squad_value := private.current_profile_squad_id();
  if role_value <> 'supervisor'::public.app_role then raise exception 'role function returned %', role_value; end if;
  if squad_value <> squad_id then raise exception 'squad function returned %', squad_value; end if;
  if private.is_in_current_squad(future_user) is distinct from true then raise exception 'same squad was rejected'; end if;

  update public.profiles set active = false where id = future_user;
  if private.current_profile_role() is not null then raise exception 'inactive user retained role'; end if;
  if private.current_profile_squad_id() is not null then raise exception 'inactive user retained squad'; end if;
  if private.is_in_current_squad(future_user) is distinct from false then raise exception 'inactive user retained squad access'; end if;
end
$$;

alter table public.profiles validate constraint profiles_auth_user_id_fkey;
alter table public.profiles validate constraint profiles_squad_id_fkey;
alter table public.profiles validate constraint profiles_identity_pair_check;
alter table public.access_preapprovals validate constraint access_preapprovals_identity_pair_check;

do $$
begin
  if exists (select 1 from pg_constraint where conname in ('profiles_auth_user_id_fkey', 'profiles_squad_id_fkey', 'profiles_identity_pair_check', 'access_preapprovals_identity_pair_check') and not convalidated) then
    raise exception 'constraints could not be validated';
  end if;
end
$$;
