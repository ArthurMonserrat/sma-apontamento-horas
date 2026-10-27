begin;

-- =====================================================================
-- Cargo do colaborador (preenchido pela diretoria na tela Equipes)
-- * profiles.job_title: cargo usado nas telas e nas exportações Excel.
-- * banco1_set_job_title: só a diretoria do Banco 1 altera.
-- * banco1_people() passa a devolver o cargo.
-- Pré-requisito: 20261027120000_banco1_time_entries.sql aplicada.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

alter table public.profiles add column if not exists job_title text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_job_title_length') then
    alter table public.profiles add constraint profiles_job_title_length
      check (job_title is null or length(btrim(job_title)) between 1 and 80);
  end if;
end;
$$;

comment on column public.profiles.job_title is 'Cargo (ex.: Engenheiro, Projetista). Alterado pela diretoria via banco1_set_job_title.';

-- O retorno mudou (nova coluna job_title): a função precisa ser recriada.
drop function if exists public.banco1_people();

create function public.banco1_people()
returns table (
  id uuid,
  full_name text,
  email text,
  module_role text,
  team_id uuid,
  team_name text,
  supervisor_id uuid,
  supervisor_name text,
  job_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select private.module_role('BANCO_1') as role
  ),
  people as (
    select p.id, p.full_name, p.email, coalesce(a.role, p.role)::text as module_role, p.job_title
    from public.profiles as p
    join public.profile_module_access as a on a.profile_id = p.id and a.module = 'BANCO_1' and a.active
    where p.active
  )
  select pe.id, pe.full_name, pe.email, pe.module_role,
         t.id, t.name, t.supervisor_id, sp.full_name, pe.job_title
  from people as pe
  cross join caller as c
  left join public.team_members as m on m.profile_id = pe.id and m.module = 'BANCO_1' and m.active
  left join public.teams as t on t.id = m.team_id and t.active
  left join public.profiles as sp on sp.id = t.supervisor_id
  where c.role is not null
    and (
      pe.id = auth.uid()
      or c.role = 'diretor'
      or (c.role = 'supervisor' and t.supervisor_id = auth.uid())
    )
  order by pe.full_name nulls last, pe.email
$$;

comment on function public.banco1_people() is 'Pessoas do Banco 1 que o usuário pode ver (com equipe, supervisor e cargo): ele mesmo; supervisor vê a equipe; diretoria vê todos.';

create or replace function public.banco1_set_job_title(target uuid, job_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_title text := nullif(btrim(coalesce(job_title, '')), '');
begin
  if private.module_role('BANCO_1') is distinct from 'diretor' then
    raise exception 'Somente a diretoria pode alterar o cargo.' using errcode = '42501';
  end if;
  if clean_title is not null and length(clean_title) > 80 then
    raise exception 'O cargo deve ter até 80 caracteres.' using errcode = '22023';
  end if;
  update public.profiles as p set job_title = clean_title, updated_at = now() where p.id = target;
  if not found then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.banco1_set_job_title(uuid, text) is 'Diretoria: define o cargo de uma pessoa (vazio apaga).';

revoke all privileges on function public.banco1_people() from public, anon;
revoke all privileges on function public.banco1_set_job_title(uuid, text) from public, anon;
grant execute on function public.banco1_people() to authenticated;
grant execute on function public.banco1_set_job_title(uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';
