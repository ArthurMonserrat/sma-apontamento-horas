\set ON_ERROR_STOP on

do $$
declare
  user_id uuid := '00000000-0000-0000-0000-000000000001';
  target_squad_id uuid := '20000000-0000-0000-0000-000000000001';
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    raise exception 'historical app_role enum missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'squad_id') then
    raise exception 'historical profiles.squad_id missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    raise exception 'historical profiles -> auth.users FK missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_squad_id_fkey') then
    raise exception 'historical profiles -> squads FK missing';
  end if;
  if to_regclass('public.access_preapprovals') is not null then
    raise exception 'historical migration unexpectedly created access_preapprovals';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public') <> 17 then
    raise exception 'unexpected historical policy count';
  end if;
  if has_function_privilege('anon', 'private.current_profile_role()', 'execute') then
    raise exception 'anon can execute historical role helper';
  end if;
  if has_function_privilege('authenticated', 'private.current_profile_role()', 'execute') is distinct from true then
    raise exception 'authenticated cannot execute historical role helper';
  end if;

  insert into auth.users (id, email) values (user_id, 'historical@example.invalid');
  insert into public.profiles (id, email, full_name, role)
    values (user_id, 'historical@example.invalid', 'Historical Profile', 'colaborador');
  insert into public.squads (id, name, supervisor_id)
    values (target_squad_id, 'Historical Squad', user_id);
  update public.profiles set squad_id = target_squad_id where id = user_id;

  if not exists (select 1 from public.profiles where id = user_id and role = 'colaborador'::public.app_role) then
    raise exception 'historical profile insert failed';
  end if;
  if not exists (select 1 from public.profiles where id = user_id and squad_id = target_squad_id) then
    raise exception 'historical squad link failed';
  end if;
end
$$;
