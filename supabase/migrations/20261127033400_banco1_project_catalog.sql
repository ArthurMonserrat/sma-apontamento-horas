begin;

create table if not exists public.banco1_project_catalog (
  code text primary key check (length(btrim(code)) between 1 and 80 and code = btrim(code)),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.banco1_project_catalog enable row level security;
revoke all on public.banco1_project_catalog from public, anon, authenticated;
grant select on public.banco1_project_catalog to authenticated;
grant all on public.banco1_project_catalog to service_role;

drop policy if exists banco1_project_catalog_select on public.banco1_project_catalog;
create policy banco1_project_catalog_select on public.banco1_project_catalog
  for select to authenticated using (private.module_role('BANCO_1') is not null);

create or replace function public.banco1_import_project_codes(codes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare imported integer;
begin
  if codes is null or jsonb_typeof(codes) <> 'array' or jsonb_array_length(codes) = 0 then
    raise exception 'Catálogo vazio ou inválido.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(codes) as item(value)
    where jsonb_typeof(item.value) <> 'string'
      or length(btrim(item.value #>> '{}')) not between 1 and 80
      or item.value #>> '{}' <> btrim(item.value #>> '{}')
  ) then
    raise exception 'Código de projeto inválido.' using errcode = '22023';
  end if;
  with incoming as (
    select distinct item.value #>> '{}' as code from jsonb_array_elements(codes) as item(value)
  ), saved as (
    insert into public.banco1_project_catalog (code)
    select code from incoming
    on conflict (code) do update set last_seen_at = now()
    returning 1
  ) select count(*) into imported from saved;
  return imported;
end;
$$;

revoke all on function public.banco1_import_project_codes(jsonb) from public, anon, authenticated;
grant execute on function public.banco1_import_project_codes(jsonb) to service_role;

commit;
