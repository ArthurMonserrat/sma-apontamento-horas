\set ON_ERROR_STOP on

-- Synthetic PostgreSQL baseline for Stage 3B.1.
-- This is not a Supabase production dump and contains no real data.
begin;

create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists private;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create type public.app_role as enum ('colaborador', 'supervisor', 'diretor');

create table auth.users (
  id uuid primary key,
  email text not null
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supervisor_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  role text not null default 'colaborador',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('colaborador', 'supervisor', 'diretor'))
);

create table public.access_preapprovals (
  email text primary key,
  full_name text not null,
  role text not null,
  active boolean not null default true,
  microsoft_tenant_id uuid,
  microsoft_object_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_preapprovals_role_check check (role in ('colaborador', 'supervisor', 'diretor'))
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'legacy@example.invalid');

insert into public.profiles (id, email, full_name, role) values
  ('10000000-0000-0000-0000-000000000001', 'legacy@example.invalid', 'Legacy Profile', 'colaborador'),
  ('10000000-0000-0000-0000-000000000002', 'legacy-director@example.invalid', 'Legacy Director', 'diretor');

insert into public.access_preapprovals (email, full_name, role) values
  ('director-1@example.invalid', 'Synthetic Director', 'diretor'),
  ('supervisor-1@example.invalid', 'Synthetic Supervisor', 'supervisor'),
  ('supervisor-2@example.invalid', 'Synthetic Supervisor 2', 'supervisor'),
  ('collaborator-1@example.invalid', 'Synthetic Collaborator', 'colaborador'),
  ('inactive-1@example.invalid', 'Synthetic Inactive', 'colaborador');

-- Represent the previously broken function contracts without depending on
-- columns that the foundation migration is about to add.
create or replace function private.current_profile_role()
returns public.app_role language sql stable security definer
as $$ select null::public.app_role $$;

create or replace function private.current_profile_squad_id()
returns uuid language sql stable security definer
as $$ select null::uuid $$;

create or replace function private.is_in_current_squad(target_profile_id uuid)
returns boolean language sql stable security definer
as $$ select false $$;

commit;

-- Simulate a migration that was partially applied before retrying Stage 3B.1.
alter table public.profiles add column if not exists auth_user_id uuid;
