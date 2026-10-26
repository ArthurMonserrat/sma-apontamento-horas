begin;

-- Banco 2 usa o mesmo perfil corporativo do Banco 1, mas mantém seus campos
-- próprios em um schema separado. Nenhum nome, e-mail ou cargo é copiado.
create schema if not exists banco2;

create table if not exists banco2.apontamentos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  entry_date date not null,
  start_time time,
  end_time time,
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
  em_obra boolean not null default false,
  numero_obra text,
  client_id text,
  project_code text not null,
  activity_id text not null,
  discipline_code text,
  details text not null,
  funcao_contrato text,
  assignment_snapshot jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  rejection_reason text,
  last_edit_reason text,
  cancelled_at timestamptz,
  cancel_reason text,
  version integer not null default 1 check (version > 0),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apontamentos_times_consistent check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint apontamentos_rejection_reason_check check (
    status <> 'rejected' or length(btrim(coalesce(rejection_reason, ''))) > 0
  ),
  constraint apontamentos_cancel_reason_check check (
    status <> 'cancelled'
    or (cancelled_at is not null and length(btrim(coalesce(cancel_reason, ''))) > 0)
  )
);

create index if not exists apontamentos_profile_date_idx
  on banco2.apontamentos(profile_id, entry_date desc, created_at desc);
create index if not exists apontamentos_status_idx
  on banco2.apontamentos(status, entry_date desc);
create index if not exists apontamentos_decided_by_idx
  on banco2.apontamentos(decided_by, decided_at desc);

create or replace function banco2.set_updated_at()
returns trigger
language plpgsql
set search_path = banco2, public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists apontamentos_set_updated_at on banco2.apontamentos;
create trigger apontamentos_set_updated_at
before update on banco2.apontamentos
for each row execute function banco2.set_updated_at();

-- Alterações de status, autoria e decisão serão feitas por RPCs server-side em
-- uma etapa posterior. O Data API nunca pode transformar um apontamento em
-- aprovado, trocar seu autor ou apagar seu histórico.
create or replace function banco2.guard_apontamento_mutation()
returns trigger
language plpgsql
security definer
set search_path = banco2, public, private, pg_temp
as $$
begin
  if new.id <> old.id
    or new.profile_id <> old.profile_id
    or new.created_at <> old.created_at
    or new.version <> old.version
    or new.status is distinct from old.status
    or new.rejection_reason is distinct from old.rejection_reason
    or new.decided_at is distinct from old.decided_at
    or new.decided_by is distinct from old.decided_by
    or new.cancelled_at is distinct from old.cancelled_at
    or new.cancel_reason is distinct from old.cancel_reason then
    raise exception using errcode = '42501', message = 'protected Banco 2 fields require a reviewed server operation';
  end if;

  if old.status in ('approved', 'cancelled') then
    raise exception using errcode = '42501', message = 'approved or cancelled entries cannot be edited directly';
  end if;

  -- A versão esperada é filtrada pela operação (version=eq.<expected>);
  -- o banco é quem incrementa atomicamente a versão vencedora.
  new.version := old.version + 1;

  return new;
end;
$$;

drop trigger if exists guard_apontamento_mutation on banco2.apontamentos;
create trigger guard_apontamento_mutation
before update on banco2.apontamentos
for each row execute function banco2.guard_apontamento_mutation();

alter table banco2.apontamentos enable row level security;
revoke all privileges on schema banco2 from public, anon, authenticated;
grant usage on schema banco2 to authenticated;
revoke all privileges on table banco2.apontamentos from public, anon, authenticated;
grant select, insert, update on table banco2.apontamentos to authenticated;
revoke all privileges on function banco2.set_updated_at() from public, anon, authenticated;
revoke all privileges on function banco2.guard_apontamento_mutation() from public, anon, authenticated;

drop policy if exists apontamentos_select_owner on banco2.apontamentos;
create policy apontamentos_select_owner
on banco2.apontamentos for select to authenticated
using (profile_id = private.current_profile_id());

drop policy if exists apontamentos_select_supervisor on banco2.apontamentos;
create policy apontamentos_select_supervisor
on banco2.apontamentos for select to authenticated
using (
  private.current_profile_role() = 'supervisor'
  and private.is_in_current_squad(profile_id)
);

drop policy if exists apontamentos_select_director on banco2.apontamentos;
create policy apontamentos_select_director
on banco2.apontamentos for select to authenticated
using (private.current_profile_role() = 'diretor');

drop policy if exists apontamentos_insert_owner on banco2.apontamentos;
create policy apontamentos_insert_owner
on banco2.apontamentos for insert to authenticated
with check (
  profile_id = private.current_profile_id()
  and status = 'pending'
);

drop policy if exists apontamentos_update_owner on banco2.apontamentos;
create policy apontamentos_update_owner
on banco2.apontamentos for update to authenticated
using (
  profile_id = private.current_profile_id()
  and status in ('pending', 'rejected')
)
with check (
  profile_id = private.current_profile_id()
  and status in ('pending', 'rejected')
);

commit;
