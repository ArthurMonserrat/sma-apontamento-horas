begin;

-- Bridge columns preserve the two legacy profiles. Future profiles may set
-- id = auth.users.id and auth_user_id = id; no existing row is rewritten here.
alter table public.profiles
  add column if not exists auth_user_id uuid,
  add column if not exists microsoft_tenant_id uuid,
  add column if not exists microsoft_object_id uuid,
  add column if not exists squad_id uuid;

alter table public.profiles
  add constraint profiles_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete restrict not valid;

alter table public.profiles
  add constraint profiles_squad_id_fkey
  foreign key (squad_id) references public.squads(id) on delete restrict not valid;

alter table public.profiles
  add constraint profiles_identity_pair_check
  check ((microsoft_tenant_id is null) = (microsoft_object_id is null)) not valid;

alter table public.access_preapprovals
  add constraint access_preapprovals_identity_pair_check
  check ((microsoft_tenant_id is null) = (microsoft_object_id is null)) not valid;

create unique index if not exists profiles_auth_user_id_uidx
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists profiles_microsoft_identity_uidx
  on public.profiles(microsoft_tenant_id, microsoft_object_id)
  where microsoft_tenant_id is not null and microsoft_object_id is not null;

create unique index if not exists access_preapprovals_microsoft_identity_uidx
  on public.access_preapprovals(microsoft_tenant_id, microsoft_object_id)
  where microsoft_tenant_id is not null and microsoft_object_id is not null;

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

revoke all on table private.corporate_provisioning_audit from public, anon, authenticated;

create or replace function private.current_profile_role()
returns app_role
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select p.role::app_role
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
      and p.active = true
      and p.squad_id = private.current_profile_squad_id()
  )
$$;

revoke execute on function private.current_profile_role() from public, anon;
revoke execute on function private.current_profile_squad_id() from public, anon;
revoke execute on function private.is_in_current_squad(uuid) from public, anon;
grant execute on function private.current_profile_role() to authenticated;
grant execute on function private.current_profile_squad_id() to authenticated;
grant execute on function private.is_in_current_squad(uuid) to authenticated;

commit;
