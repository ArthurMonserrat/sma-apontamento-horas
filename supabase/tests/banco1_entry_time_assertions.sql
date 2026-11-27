begin;

set local role service_role;

do $$
declare
  collaborator uuid;
  inserted_id uuid;
begin
  select id into collaborator
  from public.profiles
  where active and auth_user_id is not null
  order by id
  limit 1;

  if collaborator is null then
    raise exception 'Nenhum perfil sintético ativo disponível para testar os horários.';
  end if;

  begin
    insert into public.banco1_time_entries (
      collaborator_id, entry_date, client_name, project_code, activity_id,
      discipline_code, document_type_code, duration_minutes, details
    ) values (
      collaborator, current_date, '—', 'TEST-TIME-MISSING', 'activity-test',
      '—', '—', 60, ''
    );
    raise exception 'Um novo apontamento sem intervalo foi aceito.';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.banco1_time_entries (
      collaborator_id, entry_date, client_name, project_code, activity_id,
      discipline_code, document_type_code, duration_minutes, details, start_time, end_time
    ) values (
      collaborator, current_date, '—', 'TEST-TIME-INVALID', 'activity-test',
      '—', '—', 60, '', '17:00', '08:00'
    );
    raise exception 'Um novo apontamento com intervalo invertido foi aceito.';
  exception when check_violation then
    null;
  end;

  insert into public.banco1_time_entries (
    collaborator_id, entry_date, client_name, project_code, activity_id,
    discipline_code, document_type_code, duration_minutes, details, start_time, end_time
  ) values (
    collaborator, current_date, '—', 'TEST-TIME-VALID', 'activity-test',
    '—', '—', 540, '', '08:00', '17:00'
  ) returning id into inserted_id;

  delete from public.banco1_time_entries where id = inserted_id;
end;
$$;

rollback;
