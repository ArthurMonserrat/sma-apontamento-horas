-- Assertions estruturais para o contrato Banco 2. A execução comportamental
-- com auth.users sintéticos deve ocorrer no Supabase local, nunca em produção.
do $$
begin
  if to_regclass('banco2.apontamentos') is null then
    raise exception 'banco2.apontamentos missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'banco2.apontamentos'::regclass
      and contype = 'f'
      and conname like '%profile%'
  ) then
    raise exception 'banco2.apontamentos must reference public.profiles';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'banco2'
      and tablename = 'apontamentos'
      and policyname = 'apontamentos_insert_owner'
  ) then
    raise exception 'owner insert policy missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'banco2'
      and tablename = 'apontamentos'
      and policyname = 'apontamentos_select_supervisor'
  ) then
    raise exception 'supervisor select policy missing';
  end if;
  if has_table_privilege('anon', 'banco2.apontamentos', 'SELECT') then
    raise exception 'anon must not select Banco 2 entries';
  end if;
  if not has_table_privilege('authenticated', 'banco2.apontamentos', 'SELECT') then
    raise exception 'authenticated must be able to use RLS-protected SELECT';
  end if;
  if has_table_privilege('authenticated', 'banco2.apontamentos', 'TRUNCATE')
    or has_table_privilege('authenticated', 'banco2.apontamentos', 'REFERENCES')
    or has_table_privilege('authenticated', 'banco2.apontamentos', 'TRIGGER') then
    raise exception 'authenticated has excessive Banco 2 privileges';
  end if;
end
$$;
