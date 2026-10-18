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
  if has_table_privilege('anon', 'public.profiles', 'update') or has_table_privilege('authenticated', 'public.profiles', 'update') then
    raise exception 'profile update privilege is too broad';
  end if;
  if has_table_privilege('anon', 'public.access_preapprovals', 'select') or has_table_privilege('authenticated', 'public.access_preapprovals', 'select') then
    raise exception 'preapproval read privilege is too broad';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')) then
    raise exception 'direct auth.uid policy comparison remains';
  end if;

  insert into auth.users (id, email) values (test_user, 'reconciliation@example.invalid');
  insert into public.squads (id, name, supervisor_id) values (test_squad, 'Reconciliation Squad', test_user);
  insert into public.profiles (id, auth_user_id, email, full_name, role, active, squad_id)
    values (test_user, test_user, 'reconciliation@example.invalid', 'Reconciliation User', 'colaborador', true, test_squad);

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
