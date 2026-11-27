begin;

do $$
begin
  if has_table_privilege('anon', 'public.banco1_project_catalog', 'SELECT')
     or has_table_privilege('authenticated', 'public.banco1_project_catalog', 'INSERT')
     or has_table_privilege('authenticated', 'public.banco1_project_catalog', 'UPDATE')
     or has_table_privilege('authenticated', 'public.banco1_project_catalog', 'DELETE')
     or has_function_privilege('anon', 'public.banco1_import_project_codes(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.banco1_import_project_codes(jsonb)', 'EXECUTE') then
    raise exception 'Privilégios excessivos no catálogo de projetos';
  end if;
end;
$$;

set local role service_role;
select public.banco1_import_project_codes('["OBRA-1", "OBRA-2"]'::jsonb);
select public.banco1_import_project_codes('["OBRA-2", "OBRA-3"]'::jsonb);
reset role;

do $$
begin
  if (select array_agg(code order by code) from public.banco1_project_catalog)
     is distinct from array['OBRA-1','OBRA-2','OBRA-3'] then
    raise exception 'Importação aditiva de projetos falhou';
  end if;
end;
$$;

rollback;
