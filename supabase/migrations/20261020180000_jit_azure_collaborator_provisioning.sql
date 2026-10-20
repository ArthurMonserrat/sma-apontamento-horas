begin;

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
    insert into public.profiles (id, auth_user_id, email, full_name, role, active, squad_id)
    values (
      auth_user.id,
      auth_user.id,
      normalized_email,
      profile_name,
      'colaborador'::public.app_role,
      true,
      null
    )
    on conflict (auth_user_id) where auth_user_id is not null do nothing;

    get diagnostics inserted_count = row_count;
  exception when unique_violation then
    insert into private.corporate_provisioning_audit (
      auth_user_id, preapproval_email, outcome, reason
    ) values (
      auth_user.id, normalized_email, 'denied', 'profile_email_or_id_collision'
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
        where p.auth_user_id = u.id
      )
  loop
    perform private.provision_azure_collaborator(target_user_id);
  end loop;
end;
$$;

comment on function private.provision_azure_collaborator(uuid) is
  'Idempotently creates only an active collaborator profile for a Supabase Auth Azure identity; never links by email or changes existing profiles.';
comment on function private.handle_azure_auth_user_created() is
  'Auth trigger wrapper for private Azure collaborator JIT provisioning.';

commit;
