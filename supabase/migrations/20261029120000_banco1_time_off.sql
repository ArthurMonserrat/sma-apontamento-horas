begin;

-- =====================================================================
-- Banco 1 — ausências (folga, férias, atestado, outros) no banco de dados
-- * Colaborador pede (só para data futura), retira o pedido pendente e cancela
--   a ausência aprovada antes da data.
-- * Supervisor aprova/rejeita as da sua equipe; diretoria, todas
--   (função banco1_decide_time_off).
-- * Ninguém apaga: cancelamento fica registrado.
-- Pré-requisito: 20261027120000_banco1_time_entries.sql aplicada.
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

do $$
begin
  if to_regclass('public.teams') is null then
    raise exception 'Aplique antes a migration 20261027120000_banco1_time_entries.sql.';
  end if;
end;
$$;

create table if not exists public.banco1_time_off_requests (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.profiles(id) on delete restrict,
  absence_type text not null default 'Folga' check (absence_type in ('Folga', 'Férias', 'Atestado Médico', 'Outros')),
  start_date date not null,
  end_date date not null,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  team_id uuid references public.teams(id) on delete set null,
  assignment_snapshot jsonb,
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 500),
  cancellation_reason text check (cancellation_reason is null or length(cancellation_reason) <= 500),
  cancelled_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banco1_time_off_dates check (end_date >= start_date),
  constraint banco1_time_off_rejection check (status <> 'REJECTED' or length(btrim(coalesce(rejection_reason, ''))) > 0),
  constraint banco1_time_off_cancel check ((status = 'CANCELLED') = (cancelled_at is not null))
);

create index if not exists banco1_time_off_collaborator_idx on public.banco1_time_off_requests (collaborator_id, start_date);
create index if not exists banco1_time_off_team_idx on public.banco1_time_off_requests (team_id, status);

comment on table public.banco1_time_off_requests is 'Ausências do Banco 1. Decisão só por banco1_decide_time_off; cancelamento em vez de exclusão.';

-- Hoje no horário de Brasília (a regra "data futura" não depende do relógio do navegador).
create or replace function private.banco1_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function private.banco1_time_off_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_decision boolean := coalesce(current_setting('banco1.decision', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.start_date <= private.banco1_today() then
      raise exception 'A ausência deve ser solicitada para uma data futura.' using errcode = 'check_violation';
    end if;
    new.status := 'PENDING';
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
    new.rejection_reason := null;
    new.cancellation_reason := null;
    new.cancelled_at := null;
    new.decided_at := null;
    new.decided_by := null;
    -- Equipe sempre definida pelo banco (equipe ativa da pessoa).
    new.team_id := private.active_team_id(new.collaborator_id, 'BANCO_1');
    return new;
  end if;

  if new.id <> old.id or new.collaborator_id <> old.collaborator_id or new.created_at <> old.created_at
     or new.start_date <> old.start_date or new.end_date <> old.end_date or new.absence_type <> old.absence_type
     or new.reason <> old.reason then
    raise exception 'A solicitação de ausência não pode ser alterada; cancele e peça de novo.' using errcode = 'check_violation';
  end if;
  new.team_id := old.team_id;
  new.assignment_snapshot := old.assignment_snapshot;

  if is_decision then
    if old.status <> 'PENDING' then
      raise exception 'A solicitação de ausência não está pendente.' using errcode = 'check_violation';
    end if;
    new.cancellation_reason := old.cancellation_reason;
    new.cancelled_at := old.cancelled_at;
  else
    -- Caminho do colaborador: só cancelar.
    new.decided_at := old.decided_at;
    new.decided_by := old.decided_by;
    new.rejection_reason := old.rejection_reason;
    if new.status is distinct from 'CANCELLED' or old.status not in ('PENDING', 'APPROVED') then
      raise exception 'Somente uma ausência pendente ou aprovada pode ser cancelada.' using errcode = 'check_violation';
    end if;
    if old.start_date <= private.banco1_today() then
      raise exception 'A data da ausência já ocorreu e não permite cancelamento direto.' using errcode = 'check_violation';
    end if;
    if length(btrim(coalesce(new.cancellation_reason, ''))) = 0 then
      raise exception 'Informe o motivo do cancelamento da ausência.' using errcode = 'check_violation';
    end if;
    new.cancelled_at := now();
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists banco1_time_off_guard on public.banco1_time_off_requests;
create trigger banco1_time_off_guard
before insert or update on public.banco1_time_off_requests
for each row execute function private.banco1_time_off_guard();

alter table public.banco1_time_off_requests enable row level security;
revoke all privileges on table public.banco1_time_off_requests from public, anon, authenticated;
grant select, insert, update on table public.banco1_time_off_requests to authenticated;
grant all privileges on table public.banco1_time_off_requests to service_role;

drop policy if exists banco1_time_off_select on public.banco1_time_off_requests;
create policy banco1_time_off_select on public.banco1_time_off_requests for select to authenticated
using (
  (collaborator_id = auth.uid() and private.module_role('BANCO_1') is not null)
  or private.module_role('BANCO_1') = 'diretor'
  or (private.module_role('BANCO_1') = 'supervisor' and private.supervises(collaborator_id, 'BANCO_1'))
);

drop policy if exists banco1_time_off_insert_own on public.banco1_time_off_requests;
create policy banco1_time_off_insert_own on public.banco1_time_off_requests for insert to authenticated
with check (collaborator_id = auth.uid() and private.module_role('BANCO_1') is not null);

drop policy if exists banco1_time_off_update_own on public.banco1_time_off_requests;
create policy banco1_time_off_update_own on public.banco1_time_off_requests for update to authenticated
using (collaborator_id = auth.uid() and status in ('PENDING', 'APPROVED'))
with check (collaborator_id = auth.uid());

create or replace function public.banco1_decide_time_off(request_id uuid, decision text, reason text default null)
returns setof public.banco1_time_off_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := private.module_role('BANCO_1');
  target public.banco1_time_off_requests;
  clean_reason text := nullif(btrim(coalesce(reason, '')), '');
begin
  if caller_role is null or caller_role not in ('supervisor', 'diretor') then
    raise exception 'Somente supervisão ou diretoria podem decidir ausências.' using errcode = '42501';
  end if;
  if decision not in ('APPROVED', 'REJECTED') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  if decision = 'REJECTED' and clean_reason is null then
    raise exception 'Informe o motivo da rejeição da ausência.' using errcode = '22023';
  end if;
  select * into target from public.banco1_time_off_requests where id = request_id for update;
  if not found then
    raise exception 'Solicitação de ausência não encontrada.' using errcode = 'P0002';
  end if;
  if target.collaborator_id = auth.uid() then
    raise exception 'Ninguém aprova a própria ausência.' using errcode = '42501';
  end if;
  if caller_role = 'supervisor' and not private.supervises(target.collaborator_id, 'BANCO_1') then
    raise exception 'Ausência fora da sua equipe.' using errcode = '42501';
  end if;

  perform set_config('banco1.decision', 'on', true);
  return query
    update public.banco1_time_off_requests
    set status = decision,
        rejection_reason = case when decision = 'REJECTED' then clean_reason else null end,
        decided_at = now(),
        decided_by = auth.uid()
    where id = request_id
    returning *;
  perform set_config('banco1.decision', '', true);
end;
$$;

comment on function public.banco1_decide_time_off(uuid, text, text) is 'Aprova/rejeita ausência do Banco 1. Supervisor: só da equipe; diretoria: todas.';

revoke all privileges on function private.banco1_time_off_guard() from public, anon, authenticated;
revoke all privileges on function private.banco1_today() from public, anon;
grant execute on function private.banco1_today() to authenticated;
revoke all privileges on function public.banco1_decide_time_off(uuid, text, text) from public, anon;
grant execute on function public.banco1_decide_time_off(uuid, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
