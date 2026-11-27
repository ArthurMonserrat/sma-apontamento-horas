begin;

alter table public.banco1_project_catalog
  add column if not exists title text;

alter table public.banco1_project_catalog
  drop constraint if exists banco1_project_catalog_title_check;

alter table public.banco1_project_catalog
  add constraint banco1_project_catalog_title_check
  check (title is null or length(btrim(title)) between 1 and 160);

create or replace function public.banco1_import_project_codes(codes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  imported integer;
begin
  if codes is null or jsonb_typeof(codes) <> 'array' or jsonb_array_length(codes) = 0 then
    raise exception 'Catálogo vazio ou inválido.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(codes) as item(value)
    cross join lateral (
      select
        case when jsonb_typeof(item.value) = 'string' then item.value #>> '{}' else item.value ->> 'code' end as code,
        case when jsonb_typeof(item.value) = 'object' then nullif(btrim(item.value ->> 'title'), '') end as title,
        case when jsonb_typeof(item.value) = 'object' then jsonb_typeof(item.value -> 'title') end as title_type
    ) as normalized
    where jsonb_typeof(item.value) not in ('string', 'object')
       or normalized.code is null
       or length(btrim(normalized.code)) not between 1 and 80
       or normalized.code <> btrim(normalized.code)
       or (normalized.title_type is not null and normalized.title_type not in ('null', 'string'))
       or (normalized.title is not null and length(normalized.title) > 160)
  ) then
    raise exception 'Código ou título de projeto inválido.' using errcode = '22023';
  end if;

  with incoming as (
    select distinct on (normalized.code)
      btrim(normalized.code) as code,
      normalized.title
    from jsonb_array_elements(codes) as item(value)
    cross join lateral (
      select
        case when jsonb_typeof(item.value) = 'string' then item.value #>> '{}' else item.value ->> 'code' end as code,
        case when jsonb_typeof(item.value) = 'object' then nullif(btrim(item.value ->> 'title'), '') end as title
    ) as normalized
    order by normalized.code, (normalized.title is not null) desc
  ), saved as (
    insert into public.banco1_project_catalog (code, title)
    select code, title from incoming
    on conflict (code) do update set
      title = coalesce(excluded.title, public.banco1_project_catalog.title),
      last_seen_at = now()
    returning 1
  )
  select count(*) into imported from saved;
  return imported;
end;
$$;

revoke all on function public.banco1_import_project_codes(jsonb) from public, anon, authenticated;
grant execute on function public.banco1_import_project_codes(jsonb) to service_role;

comment on column public.banco1_project_catalog.title is 'Título reduzido sincronizado da fonte corporativa; não é usado como identificador do apontamento.';

commit;
