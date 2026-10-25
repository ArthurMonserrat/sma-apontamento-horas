begin;

-- O Supabase cria o usuário Azure em auth.users ANTES de preencher email_confirmed_at.
-- O trigger AFTER INSERT via o e-mail ainda não confirmado e negava o perfil (azure_email_unverified).
-- Solução: provisionar também quando o usuário é atualizado (confirmação de e-mail ou novo login).
create or replace function private.handle_azure_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  failure_sqlstate text;
begin
  -- Já tem perfil: nada a fazer (evita trabalho e auditoria repetida a cada login).
  if exists (select 1 from public.profiles as p where p.id = new.id) then
    return new;
  end if;
  begin
    perform private.provision_azure_collaborator(new.id);
  exception when others then
    get stacked diagnostics failure_sqlstate = returned_sqlstate;
    raise warning 'Azure JIT update trigger suppressed provisioning failure (SQLSTATE %).', failure_sqlstate;
  end;
  return new;
end;
$$;

revoke all privileges on function private.handle_azure_auth_user_updated() from public, anon, authenticated;

drop trigger if exists on_auth_user_updated_provision_azure_collaborator on auth.users;
create trigger on_auth_user_updated_provision_azure_collaborator
after update of email_confirmed_at, last_sign_in_at on auth.users
for each row
when (new.email_confirmed_at is not null)
execute function private.handle_azure_auth_user_updated();

-- Corrige quem já ficou sem perfil (ex.: pedro.xavier): usuários Azure confirmados e sem perfil.
do $$
declare
  target_user_id uuid;
begin
  for target_user_id in
    select u.id from auth.users as u
    where lower(coalesce(u.raw_app_meta_data ->> 'provider', '')) = 'azure'
      and u.email_confirmed_at is not null
      and not exists (select 1 from public.profiles as p where p.id = u.id)
  loop
    perform private.provision_azure_collaborator(target_user_id);
  end loop;
end;
$$;

commit;

