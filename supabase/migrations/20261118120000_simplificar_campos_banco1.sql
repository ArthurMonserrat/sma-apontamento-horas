begin;

do $$
begin
  if to_regclass('public.banco1_time_entries') is null then
    raise exception 'Aplique antes a migration 20261027120000_banco1_time_entries.sql.';
  end if;
end;
$$;

alter table public.banco1_time_entries
  add column if not exists primary_code text,
  add column if not exists secondary_code text;

alter table public.banco1_time_entries
  drop constraint if exists banco1_time_entries_client_name_check,
  drop constraint if exists banco1_time_entries_discipline_code_check,
  drop constraint if exists banco1_time_entries_document_type_code_check;

alter table public.banco1_time_entries
  alter column client_name drop not null,
  alter column discipline_code drop not null,
  alter column document_type_code drop not null;

alter table public.banco1_time_entries
  add constraint banco1_time_entries_primary_code_length
    check (primary_code is null or length(btrim(primary_code)) <= 160),
  add constraint banco1_time_entries_secondary_code_length
    check (secondary_code is null or length(btrim(secondary_code)) <= 160);

comment on column public.banco1_time_entries.client_name is 'Campo legado: novos apontamentos manuais não o preenchem.';
comment on column public.banco1_time_entries.ld_document is 'Campo legado: a leitura de LD não faz parte de novos apontamentos.';
comment on column public.banco1_time_entries.discipline_code is 'Campo legado: novos apontamentos manuais não o preenchem.';
comment on column public.banco1_time_entries.document_type_code is 'Campo legado: novos apontamentos manuais não o preenchem.';
comment on column public.banco1_time_entries.primary_code is 'Código primário informado manualmente no apontamento.';
comment on column public.banco1_time_entries.secondary_code is 'Código secundário informado manualmente no apontamento.';

notify pgrst, 'reload schema';

commit;
