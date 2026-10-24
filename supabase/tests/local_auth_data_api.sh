#!/usr/bin/env bash
set -Eeuo pipefail

: "${API_URL:?API_URL must come from supabase status -o env}"
: "${ANON_KEY:?ANON_KEY must come from supabase status -o env}"
: "${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY must come from supabase status -o env}"
: "${DB_URL:?DB_URL must come from supabase status -o env}"

password='LocalOnly-3B2B3-2026!'
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

create_user() {
  local email="$1"
  local response
  response="$(curl --fail-with-body --silent --show-error \
    -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    --data "$(jq -cn --arg email "$email" --arg password "$password" '{email:$email,password:$password,email_confirm:true}')")"
  jq -er '.id' <<<"$response"
}

create_azure_user() {
  local email="$1"
  local response
  response="$(curl --fail-with-body --silent --show-error \
    -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    --data "$(jq -cn --arg email "$email" --arg password "$password" '{email:$email,password:$password,email_confirm:true,user_metadata:{full_name:"Synthetic Azure User",role:"diretor"},app_metadata:{provider:"azure"}}')")"
  jq -er '.id' <<<"$response"
}

login_user() {
  local email="$1"
  curl --fail-with-body --silent --show-error \
    -X POST "$API_URL/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON_KEY" \
    -H 'Content-Type: application/json' \
    --data "$(jq -cn --arg email "$email" --arg password "$password" '{email:$email,password:$password}')" \
    | jq -er '.access_token'
}

request_status() {
  local method="$1" url="$2" token="${3:-}" body="${4:-}"
  local args=(--silent --show-error --output "$tmp_dir/response" --write-out '%{http_code}' -X "$method" "$url" -H "apikey: $ANON_KEY")
  if [[ -n "$token" ]]; then args+=( -H "Authorization: Bearer $token" ); fi
  if [[ -n "$body" ]]; then args+=( -H 'Content-Type: application/json' --data "$body" ); fi
  curl "${args[@]}"
}

COLLAB_ID="$(create_user collab@example.invalid)"
SUPERVISOR_ID="$(create_user supervisor@example.invalid)"
OTHER_SUPERVISOR_ID="$(create_user other-supervisor@example.invalid)"
OTHER_COLLAB_ID="$(create_user other-collab@example.invalid)"
DIRECTOR_ID="$(create_user director@example.invalid)"
INACTIVE_ID="$(create_user inactive@example.invalid)"
UNLINKED_ID="$(create_user unlinked@example.invalid)"
COLLISION_OWNER_ID="$(create_user collision-owner@example.invalid)"

export COLLAB_ID SUPERVISOR_ID OTHER_SUPERVISOR_ID OTHER_COLLAB_ID DIRECTOR_ID INACTIVE_ID UNLINKED_ID COLLISION_OWNER_ID

psql "$DB_URL" --set ON_ERROR_STOP=1 \
  --variable=collab_id="$COLLAB_ID" \
  --variable=supervisor_id="$SUPERVISOR_ID" \
  --variable=other_supervisor_id="$OTHER_SUPERVISOR_ID" \
  --variable=other_collab_id="$OTHER_COLLAB_ID" \
  --variable=director_id="$DIRECTOR_ID" \
  --variable=inactive_id="$INACTIVE_ID" \
  --variable=unlinked_id="$UNLINKED_ID" \
  --variable=collision_owner_id="$COLLISION_OWNER_ID" <<'SQL'
insert into public.profiles (id, auth_user_id, email, full_name, role, active)
values
  (:'collab_id', :'collab_id', 'collab@example.invalid', 'Local Collaborator', 'colaborador', true),
  (:'supervisor_id', :'supervisor_id', 'supervisor@example.invalid', 'Local Supervisor', 'supervisor', true),
  (:'other_supervisor_id', :'other_supervisor_id', 'other-supervisor@example.invalid', 'Other Supervisor', 'supervisor', true),
  (:'other_collab_id', :'other_collab_id', 'other-collab@example.invalid', 'Other Collaborator', 'colaborador', true),
  (:'director_id', :'director_id', 'director@example.invalid', 'Local Director', 'diretor', true),
  (:'inactive_id', :'inactive_id', 'inactive@example.invalid', 'Inactive User', 'colaborador', false);

insert into public.profiles (id, auth_user_id, email, full_name, role, active)
values (:'collision_owner_id', :'collision_owner_id', 'shared-profile-email@example.invalid', 'Legacy Director', 'diretor', true);

insert into public.squads (id, name, supervisor_id)
values
  ('40000000-0000-0000-0000-000000000001', 'Local Squad A', :'supervisor_id'),
  ('40000000-0000-0000-0000-000000000002', 'Local Squad B', :'other_supervisor_id');

update public.profiles set squad_id = '40000000-0000-0000-0000-000000000001' where id in (:'collab_id', :'supervisor_id');
update public.profiles set squad_id = '40000000-0000-0000-0000-000000000002' where id in (:'other_collab_id', :'other_supervisor_id');

insert into public.time_entries (profile_id, date, start_time, end_time, duration_minutes, project_code, description, status)
values
  (:'collab_id', '2026-01-05', '08:00', '17:00', 480, 'LOCAL-A', 'Own collaborator entry', 'pending'),
  (:'other_collab_id', '2026-01-05', '08:00', '17:00', 480, 'LOCAL-B', 'Other squad entry', 'pending');

insert into public.access_preapprovals (email, full_name, role, active)
values ('local-preapproval@example.invalid', 'Synthetic Preapproval', 'colaborador', true);
SQL

JIT_AZURE_ID="$(create_azure_user jit-azure@example.invalid)"
COLLISION_AZURE_ID="$(create_azure_user shared-profile-email@example.invalid)"
export JIT_AZURE_ID COLLISION_AZURE_ID

psql "$DB_URL" --set ON_ERROR_STOP=1 \
  --variable=jit_azure_id="$JIT_AZURE_ID" \
  --variable=director_id="$DIRECTOR_ID" \
  --variable=unlinked_id="$UNLINKED_ID" \
  --variable=collision_azure_id="$COLLISION_AZURE_ID" <<'SQL'
select set_config('test.jit_user_id', :'jit_azure_id', false);
select set_config('test.director_id', :'director_id', false);
select set_config('test.non_azure_user_id', :'unlinked_id', false);
select set_config('test.collision_azure_id', :'collision_azure_id', false);

-- Admin-created password users remain marked as provider=email even when
-- app_metadata is supplied in the create request. Mark these fixtures as
-- Azure identities explicitly so this test exercises the OAuth postcondition.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"provider":"azure"}'::jsonb
where id in (:'jit_azure_id', :'collision_azure_id', :'director_id');
select private.provision_azure_collaborator(:'jit_azure_id'::uuid);
select private.provision_azure_collaborator(:'collision_azure_id'::uuid);
select private.provision_azure_collaborator(:'director_id'::uuid);

do $$
declare
  jit_role public.app_role;
  jit_name text;
  jit_active boolean;
  jit_squad uuid;
  jit_profile_id uuid;
  director_role public.app_role;
  collision_count integer;
begin
  select id, role, full_name, active, squad_id
    into jit_profile_id, jit_role, jit_name, jit_active, jit_squad
  from public.profiles
  where id = current_setting('test.jit_user_id')::uuid;
  if jit_profile_id is distinct from current_setting('test.jit_user_id')::uuid
     or jit_role is distinct from 'colaborador'::public.app_role
     or jit_name is distinct from 'Synthetic Azure User'
     or jit_active is distinct from true
     or jit_squad is not null then
    raise exception 'Azure profile does not satisfy the fixed collaborator profile contract';
  end if;

  select role into director_role from public.profiles where id = current_setting('test.director_id')::uuid;
  if director_role is distinct from 'diretor'::public.app_role then
    raise exception 'existing director role was modified by idempotent provisioning';
  end if;

  select count(*) into collision_count from public.profiles where id = current_setting('test.collision_azure_id')::uuid;
  if collision_count <> 0 then raise exception 'email collision linked Azure identity to a legacy profile'; end if;
  if not exists (
    select 1 from private.corporate_provisioning_audit
    where auth_user_id = current_setting('test.collision_azure_id')::uuid
      and outcome = 'denied'
      and reason = 'profile_email_collision'
  ) then raise exception 'profile collision was not audited'; end if;

  if exists (select 1 from public.profiles where id = current_setting('test.non_azure_user_id')::uuid) then
    raise exception 'non-Azure Auth user received a profile';
  end if;
end
$$;
SQL

COLLAB_TOKEN="$(login_user collab@example.invalid)"
SUPERVISOR_TOKEN="$(login_user supervisor@example.invalid)"
DIRECTOR_TOKEN="$(login_user director@example.invalid)"
JIT_AZURE_TOKEN="$(login_user jit-azure@example.invalid)"
COLLISION_AZURE_TOKEN="$(login_user shared-profile-email@example.invalid)"
INACTIVE_TOKEN="$(login_user inactive@example.invalid)"
UNLINKED_TOKEN="$(login_user unlinked@example.invalid)"

assert_ids() {
  local label="$1" status="$2" expected_json="$3"
  [[ "$status" =~ ^2 ]] || { echo "${label}: expected success, got HTTP ${status}" >&2; cat "$tmp_dir/response" >&2; exit 1; }
  local actual
  actual="$(jq -c 'map(.profile_id) | sort' "$tmp_dir/response")"
  [[ "$actual" == "$expected_json" ]] || { echo "${label}: unexpected rows: $actual" >&2; exit 1; }
}

status="$(request_status GET "$API_URL/rest/v1/time_entries?select=profile_id&order=profile_id" "$COLLAB_TOKEN")"
expected="$(jq -cn --arg id "$COLLAB_ID" '[$id]')"
assert_ids 'collaborator own entries' "$status" "$expected"

status="$(request_status GET "$API_URL/rest/v1/time_entries?select=profile_id&order=profile_id" "$SUPERVISOR_TOKEN")"
expected='[]'
assert_ids 'supervisor entries fail closed without a profile/team relationship' "$status" "$expected"

status="$(request_status GET "$API_URL/rest/v1/time_entries?select=profile_id" "$DIRECTOR_TOKEN")"
[[ "$status" =~ ^2 ]] || { echo "director read failed: HTTP $status" >&2; exit 1; }
[[ "$(jq 'length' "$tmp_dir/response")" -eq 2 ]] || { echo 'director did not see both synthetic entries' >&2; exit 1; }

for token in "$INACTIVE_TOKEN" "$UNLINKED_TOKEN"; do
  status="$(request_status GET "$API_URL/rest/v1/profiles?select=id" "$token")"
  [[ "$status" =~ ^2 ]] || { echo "unlinked/inactive profile request failed: HTTP $status" >&2; exit 1; }
  [[ "$(jq 'length' "$tmp_dir/response")" -eq 0 ]] || { echo 'unlinked or inactive user received a profile' >&2; exit 1; }
done

status="$(request_status GET "$API_URL/rest/v1/profiles?select=id,email,full_name,role,active" "$JIT_AZURE_TOKEN")"
[[ "$status" =~ ^2 ]] || { echo "JIT collaborator profile read failed: HTTP $status" >&2; exit 1; }
[[ "$(jq 'length' "$tmp_dir/response")" -eq 1 ]] || { echo 'JIT collaborator cannot read exactly one own profile' >&2; exit 1; }
jq -e --arg id "$JIT_AZURE_ID" '.[0].id == $id and .[0].role == "colaborador" and .[0].active == true' "$tmp_dir/response" >/dev/null || {
  echo 'JIT profile fields do not match the collaborator contract' >&2
  cat "$tmp_dir/response" >&2
  exit 1
}

status="$(request_status GET "$API_URL/rest/v1/profiles?select=id" "$COLLISION_AZURE_TOKEN")"
[[ "$status" =~ ^2 ]] || { echo "collision identity profile query failed: HTTP $status" >&2; exit 1; }
[[ "$(jq 'length' "$tmp_dir/response")" -eq 0 ]] || { echo 'email collision exposed the legacy profile to the Azure identity' >&2; exit 1; }

status="$(request_status GET "$API_URL/rest/v1/profiles?select=id")"
[[ ! "$status" =~ ^2 ]] || { echo 'anon unexpectedly read profiles' >&2; exit 1; }

status="$(request_status GET "$API_URL/rest/v1/access_preapprovals?select=email" "$COLLAB_TOKEN")"
[[ ! "$status" =~ ^2 ]] || { echo 'authenticated user unexpectedly read access_preapprovals' >&2; exit 1; }

status="$(request_status PATCH "$API_URL/rest/v1/profiles?id=eq.$COLLAB_ID" "$COLLAB_TOKEN" '{"role":"diretor"}')"
[[ ! "$status" =~ ^2 ]] || { echo 'direct role update unexpectedly succeeded' >&2; exit 1; }

status="$(request_status POST "$API_URL/rest/v1/time_entries" "$COLLAB_TOKEN" '{"profile_id":"00000000-0000-0000-0000-000000000099","date":"2026-01-06","start_time":"08:00","end_time":"09:00","duration_minutes":60,"project_code":"FORBIDDEN","status":"pending"}')"
[[ ! "$status" =~ ^2 ]] || { echo 'cross-profile time entry insert unexpectedly succeeded' >&2; exit 1; }

echo 'Supabase local Auth/Data API/RLS integration checks passed.'
