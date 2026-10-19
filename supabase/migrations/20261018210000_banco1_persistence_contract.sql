begin;

-- Banco 1 persistence contract. This migration is additive and does not
-- rewrite the historical migration or assign identity/roles.
alter table public.time_entries
  add column if not exists client_name text,
  add column if not exists contractor_number text,
  add column if not exists ld_document jsonb,
  add column if not exists activity_id text,
  add column if not exists discipline_code text,
  add column if not exists document_type_code text,
  add column if not exists assignment_snapshot jsonb,
  add column if not exists last_edit_reason text,
  add column if not exists source_entry_id uuid,
  add column if not exists cancelled_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'time_entries_decided_by_fkey' and conrelid = 'public.time_entries'::regclass) then
    alter table public.time_entries add constraint time_entries_decided_by_fkey
      foreign key (decided_by) references public.profiles(id) on delete restrict not valid;
  end if;
end
$$;

-- The UI captures a duration, not artificial clock times. Existing rows keep
-- their values; new duration-only rows may leave both times NULL.
alter table public.time_entries
  alter column start_time drop not null,
  alter column end_time drop not null;
alter table public.time_entries drop constraint if exists time_entries_end_after_start;
alter table public.time_entries add constraint time_entries_times_consistent check (
  (start_time is null and end_time is null) or
  (start_time is not null and end_time is not null and end_time > start_time)
);

alter table public.time_entries
  add constraint time_entries_client_name_not_blank
    check (client_name is null or length(btrim(client_name)) > 0) not valid,
  add constraint time_entries_activity_not_blank
    check (activity_id is null or length(btrim(activity_id)) > 0) not valid,
  add constraint time_entries_document_type_not_blank
    check (document_type_code is null or length(btrim(document_type_code)) > 0) not valid,
  add constraint time_entries_rejection_reason_check
    check (status <> 'rejected' or length(btrim(coalesce(rejection_reason, ''))) > 0) not valid;

create index if not exists time_entries_profile_date_status_idx
  on public.time_entries(profile_id, date, status);
create unique index if not exists time_entries_source_entry_uidx
  on public.time_entries(source_entry_id)
  where source_entry_id is not null;

create table if not exists public.time_entry_decisions (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.time_entries(id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected')),
  decided_by uuid not null references public.profiles(id) on delete restrict,
  rejection_reason text,
  expected_version integer not null,
  created_at timestamptz not null default now(),
  constraint time_entry_decision_reason_check check (
    decision <> 'rejected' or length(btrim(coalesce(rejection_reason, ''))) > 0
  )
);

create index if not exists time_entry_decisions_entry_idx
  on public.time_entry_decisions(time_entry_id, created_at desc);

revoke all privileges on table public.time_entry_decisions from public, anon, authenticated;
alter table public.time_entry_decisions enable row level security;

-- Rework is a separate immutable audit stream. The previous rejection remains
-- in time_entry_decisions; this table records the correction that reopened it.
create table if not exists public.time_entry_revisions (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.time_entries(id) on delete restrict,
  previous_version integer not null,
  new_version integer not null,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now(),
  constraint time_entry_revision_version_check check (new_version = previous_version + 1)
);

create index if not exists time_entry_revisions_entry_idx
  on public.time_entry_revisions(time_entry_id, created_at desc);

revoke all privileges on table public.time_entry_revisions from public, anon, authenticated;
alter table public.time_entry_revisions enable row level security;

create or replace function public.guard_time_entry_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  -- The approval RPC sets this transaction-local capability immediately
  -- before changing decision fields. Direct Data API updates never receive it.
  if current_setting('sma.allow_time_entry_decision', true) = 'on'
    or current_setting('sma.allow_time_entry_rework', true) = 'on' then
    return new;
  end if;

  if new.id <> old.id
    or new.profile_id <> old.profile_id
    or new.created_at <> old.created_at
    or new.offline_sync_id is distinct from old.offline_sync_id
    or new.decided_by is distinct from old.decided_by
    or new.decided_at is distinct from old.decided_at
    or new.rejection_reason is distinct from old.rejection_reason
    or new.version <> old.version + 1 then
    raise exception using errcode = '42501', message = 'protected time entry fields require a reviewed server operation';
  end if;

  if old.status <> 'pending' and new.status <> old.status then
    raise exception using errcode = '42501', message = 'only pending entries may change status';
  end if;

  if old.status = 'rejected' then
    raise exception using errcode = '42501', message = 'rejected entries require the rework server operation';
  end if;

  if new.status in ('approved', 'rejected') then
    raise exception using errcode = '42501', message = 'approval decisions require the server RPC';
  end if;

  if new.status = 'cancelled' and (new.cancelled_at is null or length(btrim(coalesce(new.cancel_reason, ''))) = 0) then
    raise exception using errcode = '22023', message = 'cancellation reason is required';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_time_entry_mutation on public.time_entries;
create trigger guard_time_entry_mutation
  before update on public.time_entries
  for each row execute function public.guard_time_entry_mutation();
revoke all privileges on function public.guard_time_entry_mutation() from public, anon, authenticated;

create or replace function public.rework_time_entry(
  target_entry_id uuid,
  expected_version integer,
  new_date date,
  new_duration_minutes integer,
  new_client_name text,
  new_project_code text,
  new_activity_id text,
  new_discipline_code text,
  new_document_type_code text,
  edit_reason text,
  new_contractor_number text default null,
  new_ld_document jsonb default null,
  new_description text default null
)
returns setof public.time_entries
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  actor_profile_id uuid;
  current_entry public.time_entries%rowtype;
  updated_entry public.time_entries%rowtype;
begin
  actor_profile_id := private.current_profile_id();
  if actor_profile_id is null then
    raise exception using errcode = '42501', message = 'authenticated profile is not available';
  end if;

  if length(btrim(coalesce(edit_reason, ''))) = 0 then
    raise exception using errcode = '22023', message = 'edit reason is required';
  end if;
  if new_duration_minutes is null or new_duration_minutes <= 0 then
    raise exception using errcode = '22023', message = 'duration must be positive';
  end if;
  if length(btrim(coalesce(new_client_name, ''))) = 0
    or length(btrim(coalesce(new_project_code, ''))) = 0
    or length(btrim(coalesce(new_activity_id, ''))) = 0
    or length(btrim(coalesce(new_discipline_code, ''))) = 0
    or length(btrim(coalesce(new_document_type_code, ''))) = 0 then
    raise exception using errcode = '22023', message = 'required time entry fields are missing';
  end if;

  select * into current_entry
  from public.time_entries
  where id = target_entry_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'time entry not found';
  end if;
  if current_entry.profile_id <> actor_profile_id then
    raise exception using errcode = '42501', message = 'collaborator is not the entry owner';
  end if;
  if current_entry.status <> 'rejected' then
    raise exception using errcode = '55000', message = 'only rejected entries can be reworked';
  end if;
  if current_entry.version <> expected_version then
    raise exception using errcode = '40001', message = 'time entry version conflict';
  end if;
  if not exists (
    select 1 from public.profiles actor
    where actor.id = actor_profile_id
      and actor.active = true
      and actor.role = 'colaborador'
  ) then
    raise exception using errcode = '42501', message = 'active collaborator profile is required';
  end if;
  if not exists (
    select 1 from public.profiles target
    where target.id = current_entry.profile_id and target.active = true
  ) then
    raise exception using errcode = '42501', message = 'inactive profile cannot rework entries';
  end if;

  perform set_config('sma.allow_time_entry_rework', 'on', true);
  begin
    update public.time_entries
    set date = new_date,
        duration_minutes = new_duration_minutes,
        client_name = btrim(new_client_name),
        project_code = btrim(new_project_code),
        contractor_number = nullif(btrim(coalesce(new_contractor_number, '')), ''),
        ld_document = new_ld_document,
        activity_id = btrim(new_activity_id),
        discipline_code = btrim(new_discipline_code),
        document_type_code = btrim(new_document_type_code),
        description = nullif(btrim(coalesce(new_description, '')), ''),
        status = 'pending',
        version = version + 1,
        last_edit_reason = btrim(edit_reason),
        rejection_reason = null,
        decided_at = null,
        decided_by = null,
        updated_at = now()
    where id = target_entry_id
    returning * into updated_entry;

    insert into public.time_entry_revisions(time_entry_id, previous_version, new_version, changed_by, reason)
    values (target_entry_id, current_entry.version, updated_entry.version, actor_profile_id, btrim(edit_reason));
    perform set_config('sma.allow_time_entry_rework', 'off', true);
  exception when others then
    perform set_config('sma.allow_time_entry_rework', 'off', true);
    raise;
  end;

  return next updated_entry;
end;
$$;

revoke all privileges on function public.rework_time_entry(uuid, integer, date, integer, text, text, text, text, text, text, text, jsonb, text) from public, anon;
grant execute on function public.rework_time_entry(uuid, integer, date, integer, text, text, text, text, text, text, text, jsonb, text) to authenticated;

create or replace function public.decide_time_entry(
  target_entry_id uuid,
  expected_version integer default null,
  decision text default 'approved',
  p_rejection_reason text default null
)
returns setof public.time_entries
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  actor_profile_id uuid;
  current_entry public.time_entries%rowtype;
  next_status public.time_entry_status;
  updated_entry public.time_entries%rowtype;
begin
  actor_profile_id := private.current_profile_id();
  if actor_profile_id is null then
    raise exception using errcode = '42501', message = 'authenticated profile is not available';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid time entry decision';
  end if;
  if decision = 'rejected' and length(btrim(coalesce(p_rejection_reason, ''))) = 0 then
    raise exception using errcode = '22023', message = 'rejection reason is required';
  end if;

  select * into current_entry
  from public.time_entries
  where id = target_entry_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'time entry not found';
  end if;
  if current_entry.status <> 'pending' then
    raise exception using errcode = '55000', message = 'time entry is not pending';
  end if;
  if expected_version is not null and current_entry.version <> expected_version then
    raise exception using errcode = '40001', message = 'time entry version conflict';
  end if;

  if not exists (
    select 1
    from public.profiles actor
    join public.profiles target on target.id = current_entry.profile_id
    where actor.id = actor_profile_id
      and actor.active = true
      and target.active = true
      and actor.role in ('supervisor', 'diretor')
      and (actor.role = 'diretor' or actor.squad_id is not null and actor.squad_id = target.squad_id)
  ) then
    raise exception using errcode = '42501', message = 'supervisor is not authorized for this team';
  end if;

  next_status := decision::public.time_entry_status;
  perform set_config('sma.allow_time_entry_decision', 'on', true);
  begin
    update public.time_entries
    set status = next_status,
        version = version + 1,
        rejection_reason = case when decision = 'rejected' then nullif(btrim(p_rejection_reason), '') else null end,
        decided_at = now(),
        decided_by = actor_profile_id,
        updated_at = now()
    where id = target_entry_id
    returning * into updated_entry;

    insert into public.time_entry_decisions(time_entry_id, decision, decided_by, rejection_reason, expected_version)
    values (target_entry_id, decision, actor_profile_id, nullif(btrim(p_rejection_reason), ''), current_entry.version);
    perform set_config('sma.allow_time_entry_decision', 'off', true);
  exception when others then
    perform set_config('sma.allow_time_entry_decision', 'off', true);
    raise;
  end;

  return next updated_entry;
end;
$$;

revoke all privileges on function public.decide_time_entry(uuid, integer, text, text) from public, anon;
grant execute on function public.decide_time_entry(uuid, integer, text, text) to authenticated;

-- Direct supervisor writes remain impossible; decisions go through the
-- transaction above so team membership, version and audit are checked
-- together. Collaborators retain their existing RLS-guarded update path.
drop policy if exists time_entries_update_supervisor_team on public.time_entries;

-- Directors may inspect all active workforce entries, but an inactive profile
-- must not become visible or actionable through this operational path.
drop policy if exists time_entries_select_director on public.time_entries;
create policy time_entries_select_director on public.time_entries for select to authenticated
using (
  private.current_profile_role() = 'diretor'
  and exists (
    select 1 from public.profiles target
    where target.id = time_entries.profile_id and target.active = true
  )
);

revoke insert, update, delete, truncate, references, trigger on table public.time_entry_decisions from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.time_entry_revisions from public, anon, authenticated;

commit;
