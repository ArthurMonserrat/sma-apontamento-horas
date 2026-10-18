begin;

-- This migration bridges the historical baseline and the later legacy schema.
-- Existing tables are validated, never dropped or rebuilt.
do $$
declare
  had_table boolean := to_regclass('public.access_preapprovals') is not null;
  required_column record;
begin
  if not had_table then
    create table public.access_preapprovals (
      email text primary key,
      full_name text not null,
      role text not null,
      active boolean not null default true,
      microsoft_tenant_id uuid,
      microsoft_object_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint access_preapprovals_role_check check (role in ('colaborador', 'supervisor', 'diretor')),
      constraint access_email_valid check (email = lower(trim(email)) and length(email) > 0),
      constraint access_name_valid check (length(trim(full_name)) > 0),
      constraint access_preapprovals_identity_pair_check check ((microsoft_tenant_id is null) = (microsoft_object_id is null))
    );
  else
    for required_column in
      select * from (values
        ('email', 'text'),
        ('full_name', 'text'),
        ('role', 'text'),
        ('active', 'boolean'),
        ('microsoft_tenant_id', 'uuid'),
        ('microsoft_object_id', 'uuid')
      ) as required(name, type_name)
    loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'access_preapprovals'
          and column_name = required_column.name
          and udt_name = required_column.type_name
      ) then
        raise exception 'incompatible access_preapprovals: missing % %', required_column.name, required_column.type_name;
      end if;
    end loop;
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.access_preapprovals'::regclass
        and contype = 'p'
        and conname = 'access_preapprovals_pkey'
    ) then
      raise exception 'incompatible access_preapprovals: email primary key is required';
    end if;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.access_preapprovals'::regclass and conname = 'access_preapprovals_role_check') then
    alter table public.access_preapprovals add constraint access_preapprovals_role_check check (role in ('colaborador', 'supervisor', 'diretor')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.access_preapprovals'::regclass and conname = 'access_email_valid') then
    alter table public.access_preapprovals add constraint access_email_valid check (email = lower(trim(email)) and length(email) > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.access_preapprovals'::regclass and conname = 'access_name_valid') then
    alter table public.access_preapprovals add constraint access_name_valid check (length(trim(full_name)) > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.access_preapprovals'::regclass and conname = 'access_preapprovals_identity_pair_check') then
    alter table public.access_preapprovals add constraint access_preapprovals_identity_pair_check
      check ((microsoft_tenant_id is null) = (microsoft_object_id is null)) not valid;
  end if;
end
$$;

create unique index if not exists access_preapprovals_microsoft_identity_uidx
  on public.access_preapprovals(microsoft_tenant_id, microsoft_object_id)
  where microsoft_tenant_id is not null and microsoft_object_id is not null;

alter table public.access_preapprovals enable row level security;
revoke all on table public.access_preapprovals from public, anon, authenticated;

commit;
