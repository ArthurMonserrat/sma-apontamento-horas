begin;

-- Keep legacy columns and rows intact. New Banco 1 entries use the contractor
-- number plus the two free codes instead of LD-derived metadata.
alter table public.time_entries
  add column if not exists primary_code text,
  add column if not exists secondary_code text;

alter table public.time_entries
  add constraint time_entries_primary_code_length_check
    check (primary_code is null or length(btrim(primary_code)) between 1 and 80) not valid,
  add constraint time_entries_secondary_code_length_check
    check (secondary_code is null or length(btrim(secondary_code)) between 1 and 80) not valid;

drop function if exists public.rework_time_entry(uuid, integer, date, integer, text, text, text, text, text, text, text, jsonb, text);

create function public.rework_time_entry(
  target_entry_id uuid,
  expected_version integer,
  new_date date,
  new_duration_minutes integer,
  new_contractor_number text,
  new_activity_id text,
  edit_reason text,
  new_primary_code text default null,
  new_secondary_code text default null,
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
  if length(btrim(coalesce(new_contractor_number, ''))) = 0
    or length(btrim(coalesce(new_contractor_number, ''))) > 80
    or length(btrim(coalesce(new_activity_id, ''))) = 0
    or length(btrim(coalesce(new_primary_code, ''))) > 80
    or length(btrim(coalesce(new_secondary_code, ''))) > 80 then
    raise exception using errcode = '22023', message = 'required time entry fields are invalid';
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
    where actor.id = actor_profile_id and actor.active = true and actor.role = 'colaborador'
  ) or not exists (
    select 1 from public.profiles target
    where target.id = current_entry.profile_id and target.active = true
  ) then
    raise exception using errcode = '42501', message = 'active collaborator profile is required';
  end if;

  perform set_config('sma.allow_time_entry_rework', 'on', true);
  begin
    update public.time_entries
    set date = new_date,
        duration_minutes = new_duration_minutes,
        project_code = btrim(new_contractor_number),
        contractor_number = btrim(new_contractor_number),
        primary_code = nullif(btrim(coalesce(new_primary_code, '')), ''),
        secondary_code = nullif(btrim(coalesce(new_secondary_code, '')), ''),
        activity_id = btrim(new_activity_id),
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

revoke all privileges on function public.rework_time_entry(uuid, integer, date, integer, text, text, text, text, text, text) from public, anon;
grant execute on function public.rework_time_entry(uuid, integer, date, integer, text, text, text, text, text, text) to authenticated;

commit;
