begin;

-- Registros históricos sem intervalo continuam legíveis. Todo novo registro,
-- e toda alteração explícita do intervalo, deve informar o período completo.
create or replace function private.banco1_time_entries_require_times()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.start_time is null or new.end_time is null then
      raise exception 'Informe a hora de início e a hora de fim.' using errcode = 'check_violation';
    end if;
    if new.end_time <= new.start_time then
      raise exception 'Informe um intervalo de horas válido, com o fim posterior ao início.' using errcode = 'check_violation';
    end if;
  elsif new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time then
    if new.start_time is null or new.end_time is null then
      raise exception 'Informe a hora de início e a hora de fim.' using errcode = 'check_violation';
    end if;
    if new.end_time <= new.start_time then
      raise exception 'Informe um intervalo de horas válido, com o fim posterior ao início.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists banco1_time_entries_require_times on public.banco1_time_entries;
create trigger banco1_time_entries_require_times
before insert or update of start_time, end_time on public.banco1_time_entries
for each row execute function private.banco1_time_entries_require_times();

comment on column public.banco1_time_entries.start_time is
  'Hora inicial obrigatória para novos apontamentos; pode ser nula somente em registros históricos.';
comment on column public.banco1_time_entries.end_time is
  'Hora final obrigatória para novos apontamentos; deve ser posterior à hora inicial.';

commit;
