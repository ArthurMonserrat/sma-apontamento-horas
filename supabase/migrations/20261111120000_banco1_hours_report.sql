begin;

-- =====================================================================
-- Banco 1 — relatório de horas (projetos, atividades, colaboradores, supervisões)
-- * banco1_hours_report(start_date, end_date): horas somadas por pessoa, projeto,
--   atividade do projeto, atividade geral e situação. Apontamentos cancelados não entram.
-- * Quem vê o quê: diretoria vê todos; supervisor (e co-supervisor) vê só a equipe dele;
--   colaborador não usa o relatório.
-- * A supervisão é a atual da pessoa (como na tela Relatórios).
-- Pré-requisito: 20261104120000_banco1_projects.sql e 20261029150000_banco1_co_supervisors.sql.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

do $$
begin
  if to_regclass('public.banco1_projects') is null or to_regclass('public.team_supervisors') is null then
    raise exception 'Aplique antes as migrations de projetos (20261104120000) e de co-supervisores (20261029150000).';
  end if;
end;
$$;

drop function if exists public.banco1_hours_report(date, date);

create function public.banco1_hours_report(start_date date, end_date date)
returns table (
  collaborator_id uuid,
  collaborator_name text,
  job_title text,
  team_id uuid,
  team_name text,
  project_id uuid,
  project_code text,
  project_description text,
  project_client text,
  project_activity_id uuid,
  project_activity_name text,
  project_activity_complement text,
  entry_project_code text,
  entry_client text,
  activity_id text,
  status text,
  minutes bigint,
  entries bigint,
  days bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_role text := private.module_role('BANCO_1');
begin
  if caller_role is null or caller_role not in ('supervisor', 'diretor') then
    raise exception 'Somente supervisão e diretoria veem os relatórios.' using errcode = '42501';
  end if;
  if start_date is null or end_date is null or end_date < start_date then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if end_date - start_date > 400 then
    raise exception 'Escolha um período de até 13 meses.' using errcode = '22023';
  end if;

  return query
  select
    e.collaborator_id,
    coalesce(nullif(btrim(p.full_name), ''), p.email)::text,
    p.job_title::text,
    t.id,
    t.name::text,
    e.project_id,
    pr.code::text,
    pr.description::text,
    pr.client::text,
    e.project_activity_id,
    pa.name::text,
    pa.complement::text,
    e.project_code::text,
    e.client_name::text,
    e.activity_id::text,
    e.status::text,
    sum(e.duration_minutes)::bigint,
    count(*)::bigint,
    count(distinct e.entry_date)::bigint
  from public.banco1_time_entries as e
  join public.profiles as p on p.id = e.collaborator_id
  left join public.team_members as m on m.profile_id = e.collaborator_id and m.module = 'BANCO_1' and m.active
  left join public.teams as t on t.id = m.team_id and t.active
  left join public.banco1_projects as pr on pr.id = e.project_id
  left join public.banco1_project_activities as pa on pa.id = e.project_activity_id
  where e.entry_date between start_date and end_date
    and e.status <> 'CANCELLED'
    and (caller_role = 'diretor' or private.supervises(e.collaborator_id, 'BANCO_1'))
  group by e.collaborator_id, p.full_name, p.email, p.job_title, t.id, t.name, e.project_id, pr.code, pr.description, pr.client,
           e.project_activity_id, pa.name, pa.complement, e.project_code, e.client_name, e.activity_id, e.status;
end;
$$;

comment on function public.banco1_hours_report(date, date) is 'Relatório de horas do Banco 1 por pessoa/projeto/atividade. Diretoria: todos; supervisor: só a equipe.';

revoke all privileges on function public.banco1_hours_report(date, date) from public, anon;
grant execute on function public.banco1_hours_report(date, date) to authenticated;

commit;

notify pgrst, 'reload schema';
