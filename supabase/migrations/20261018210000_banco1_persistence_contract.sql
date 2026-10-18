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
  add column if not exists cancelled_at timestamptz;

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
    check (document_type_code is null or length(btrim(document_type_code)) > 0) not valid;

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

create or replace function public.decide_time_entry(
  target_entry_id uuid,
  expected_version integer default null,
  decision text default 'approved',
  rejection_reason text default null
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
  if decision = 'rejected' and length(btrim(coalesce(rejection_reason, ''))) = 0 then
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
      and actor.role in ('supervisor', 'diretor')
      and (actor.role = 'diretor' or actor.squad_id is not null and actor.squad_id = target.squad_id)
  ) then
    raise exception using errcode = '42501', message = 'supervisor is not authorized for this team';
  end if;

  next_status := decision::public.time_entry_status;
  update public.time_entries
  set status = next_status,
      version = version + 1,
      updated_at = now()
  where id = target_entry_id
  returning * into updated_entry;

  insert into public.time_entry_decisions(time_entry_id, decision, decided_by, rejection_reason, expected_version)
  values (target_entry_id, decision, actor_profile_id, nullif(btrim(rejection_reason), ''), current_entry.version);

  return next updated_entry;
end;
$$;

revoke all privileges on function public.decide_time_entry(uuid, integer, text, text) from public, anon;
grant execute on function public.decide_time_entry(uuid, integer, text, text) to authenticated;

-- Direct supervisor writes remain impossible; decisions go through the
-- transaction above so team membership, version and audit are checked
-- together. Collaborators retain their existing RLS-guarded update path.
drop policy if exists time_entries_update_supervisor_team on public.time_entries;
revoke insert, update, delete, truncate, references, trigger on table public.time_entry_decisions from public, anon, authenticated;

commit;
