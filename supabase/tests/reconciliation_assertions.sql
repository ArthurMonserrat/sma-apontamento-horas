\set ON_ERROR_STOP on

-- Shared assertions for both migration paths. This is structural and
-- fail-closed; it is not managed Supabase/RLS homologation.
do $$
declare
  test_user uuid := '30000000-0000-0000-0000-000000000001';
  test_squad uuid := '30000000-0000-0000-0000-000000000002';
begin
  if (select udt_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'role') <> 'app_role' then
    raise exception 'canonical role type missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'auth_user_id') then
    raise exception 'canonical auth_user_id missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profiles_auth_user_id_uidx') then
    raise exception 'canonical auth_user_id uniqueness missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'access_preapprovals_microsoft_identity_uidx') then
    raise exception 'canonical preapproval identity uniqueness missing';
  end if;
  if has_table_privilege('anon', 'public.profiles', 'select')
     or has_table_privilege('anon', 'public.squads', 'select')
     or has_table_privilege('anon', 'public.workloads', 'select')
     or has_table_privilege('anon', 'public.time_entries', 'select')
     or has_table_privilege('anon', 'public.daily_approvals', 'select')
     or has_table_privilege('anon', 'public.access_preapprovals', 'select') then
    raise exception 'anon retains direct corporate table access';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'insert')
     or has_table_privilege('authenticated', 'public.profiles', 'update')
     or has_table_privilege('authenticated', 'public.profiles', 'delete')
     or has_table_privilege('authenticated', 'public.profiles', 'truncate')
     or has_table_privilege('authenticated', 'public.profiles', 'references')
     or has_table_privilege('authenticated', 'public.profiles', 'trigger') then
    raise exception 'authenticated retains profile administrative privilege';
  end if;
  if has_table_privilege('authenticated', 'public.access_preapprovals', 'select') then
    raise exception 'authenticated can read preapprovals directly';
  end if;
  if has_table_privilege('authenticated', 'public.squads', 'insert')
     or has_table_privilege('authenticated', 'public.squads', 'update')
     or has_table_privilege('authenticated', 'public.squads', 'delete')
     or has_table_privilege('authenticated', 'public.squads', 'truncate')
     or has_table_privilege('authenticated', 'public.squads', 'references')
     or has_table_privilege('authenticated', 'public.squads', 'trigger') then
    raise exception 'authenticated retains squad administrative privilege';
  end if;
  if has_table_privilege('authenticated', 'public.workloads', 'insert')
     or has_table_privilege('authenticated', 'public.workloads', 'update')
     or has_table_privilege('authenticated', 'public.workloads', 'delete')
     or has_table_privilege('authenticated', 'public.workloads', 'truncate')
     or has_table_privilege('authenticated', 'public.workloads', 'references')
     or has_table_privilege('authenticated', 'public.workloads', 'trigger') then
    raise exception 'authenticated retains workload administrative privilege';
  end if;
  if has_table_privilege('authenticated', 'public.time_entries', 'delete')
     or has_table_privilege('authenticated', 'public.time_entries', 'truncate')
     or has_table_privilege('authenticated', 'public.time_entries', 'references')
     or has_table_privilege('authenticated', 'public.time_entries', 'trigger') then
    raise exception 'authenticated retains time entry administrative privilege';
  end if;
  if has_table_privilege('authenticated', 'public.daily_approvals', 'update')
     or has_table_privilege('authenticated', 'public.daily_approvals', 'delete')
     or has_table_privilege('authenticated', 'public.daily_approvals', 'truncate')
     or has_table_privilege('authenticated', 'public.daily_approvals', 'references')
     or has_table_privilege('authenticated', 'public.daily_approvals', 'trigger') then
    raise exception 'authenticated retains approval administrative privilege';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')) then
    raise exception 'direct auth.uid policy comparison remains';
  end if;

  insert into auth.users (id, email) values (test_user, 'reconciliation@example.invalid');
  insert into public.profiles (id, auth_user_id, email, full_name, role, active)
    values (test_user, test_user, 'reconciliation@example.invalid', 'Reconciliation User', 'colaborador', true);
  insert into public.squads (id, name, supervisor_id) values (test_squad, 'Reconciliation Squad', test_user);
  update public.profiles set squad_id = test_squad where id = test_user;

  perform set_config('request.jwt.claim.sub', test_user::text, false);
  if private.current_profile_id() <> test_user then raise exception 'auth_user_id did not resolve profile id'; end if;
  if private.current_profile_role() <> 'colaborador'::app_role then raise exception 'role did not resolve through auth_user_id'; end if;
  if private.current_profile_squad_id() <> test_squad then raise exception 'squad did not resolve through auth_user_id'; end if;
  if private.is_in_current_squad(test_user) is distinct from true then raise exception 'linked profile was rejected from its squad'; end if;

  update public.profiles set active = false where id = test_user;
  if private.current_profile_id() is not null or private.current_profile_role() is not null or private.current_profile_squad_id() is not null then
    raise exception 'inactive profile retained authorization helpers';
  end if;
end
$$;

do $$
begin
  insert into auth.users (id, email)
  values ('30000000-0000-0000-0000-000000000003', 'rls@example.invalid');
  insert into public.profiles (id, auth_user_id, email, full_name, role, active)
  values ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'rls@example.invalid', 'RLS User', 'colaborador', true);
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', false);
do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.profiles;
  if visible_count <> 1 then
    raise exception 'authenticated RLS did not restrict profile visibility to the linked user';
  end if;
end
$$;
reset role;

set role anon;
do $$
begin
  if has_table_privilege('anon', 'public.profiles', 'select') then
    raise exception 'anon retained profile access under effective role';
  end if;
end
$$;
reset role;
