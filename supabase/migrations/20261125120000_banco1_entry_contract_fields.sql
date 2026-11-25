begin;

do $$
begin
  if to_regclass('public.banco1_time_entries') is null then
    raise exception 'Aplique antes a migration 20261027120000_banco1_time_entries.sql.';
  end if;
end;
$$;

alter table public.banco1_time_entries
  add column if not exists funcao_contrato text;

alter table public.banco1_time_entries
  drop constraint if exists banco1_time_entries_funcao_contrato_length,
  add constraint banco1_time_entries_funcao_contrato_length
    check (funcao_contrato is null or length(btrim(funcao_contrato)) <= 160);

comment on column public.banco1_time_entries.funcao_contrato is
  'Função do profissional conforme contrato do cliente final; opcional para apontamentos legados e novos.';

notify pgrst, 'reload schema';

commit;
