begin;

do $$
begin
  if to_regclass('public.banco1_time_entries') is null then
    raise exception 'Aplique antes a migration 20261027120000_banco1_time_entries.sql.';
  end if;
end;
$$;

alter table public.banco1_time_entries
  add column if not exists start_time time,
  add column if not exists end_time time;

alter table public.banco1_time_entries
  drop constraint if exists banco1_time_entries_time_range,
  add constraint banco1_time_entries_time_range
    check (
      (start_time is null and end_time is null)
      or (start_time is not null and end_time is not null and end_time > start_time)
    );

comment on column public.banco1_time_entries.start_time is
  'Hora inicial opcional para geração de RDO; não substitui duration_minutes.';
comment on column public.banco1_time_entries.end_time is
  'Hora final opcional para geração de RDO; quando preenchida, deve ser posterior a start_time.';

notify pgrst, 'reload schema';

commit;
