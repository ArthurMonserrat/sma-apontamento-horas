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
  local args=(--silent --show-error --output "$tmp_dir/response" --write-out '%{http_code}' -X "$method" "$url" -H "apikey: $ANON_KEY" -H 'Prefer: return=representation')
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

export COLLAB_ID SUPERVISOR_ID OTHER_SUPERVISOR_ID OTHER_COLLAB_ID DIRECTOR_ID INACTIVE_ID UNLINKED_ID

psql "$DB_URL" --set ON_ERROR_STOP=1 \
  --variable=collab_id="$COLLAB_ID" \
  --variable=supervisor_id="$SUPERVISOR_ID" \
  --variable=other_supervisor_id="$OTHER_SUPERVISOR_ID" \
  --variable=other_collab_id="$OTHER_COLLAB_ID" \
  --variable=director_id="$DIRECTOR_ID" \
  --variable=inactive_id="$INACTIVE_ID" \
  --variable=unlinked_id="$UNLINKED_ID" <<'SQL'
insert into public.profiles (id, auth_user_id, email, full_name, role, active)
values
  (:'collab_id', :'collab_id', 'collab@example.invalid', 'Local Collaborator', 'colaborador', true),
  (:'supervisor_id', :'supervisor_id', 'supervisor@example.invalid', 'Local Supervisor', 'supervisor', true),
  (:'other_supervisor_id', :'other_supervisor_id', 'other-supervisor@example.invalid', 'Other Supervisor', 'supervisor', true),
  (:'other_collab_id', :'other_collab_id', 'other-collab@example.invalid', 'Other Collaborator', 'colaborador', true),
  (:'director_id', :'director_id', 'director@example.invalid', 'Local Director', 'diretor', true),
  (:'inactive_id', :'inactive_id', 'inactive@example.invalid', 'Inactive User', 'colaborador', false);

insert into public.squads (id, name, supervisor_id)
values
  ('40000000-0000-0000-0000-000000000001', 'Local Squad A', :'supervisor_id'),
  ('40000000-0000-0000-0000-000000000002', 'Local Squad B', :'other_supervisor_id');

update public.profiles set squad_id = '40000000-0000-0000-0000-000000000001' where id in (:'collab_id', :'supervisor_id');
update public.profiles set squad_id = '40000000-0000-0000-0000-000000000002' where id in (:'other_collab_id', :'other_supervisor_id');
update public.profiles set squad_id = '40000000-0000-0000-0000-000000000001' where id = :'inactive_id';

insert into public.time_entries (profile_id, date, start_time, end_time, duration_minutes, project_code, description, status)
values
  (:'collab_id', '2026-01-05', '08:00', '17:00', 480, 'LOCAL-A', 'Own collaborator entry', 'pending'),
  (:'other_collab_id', '2026-01-05', '08:00', '17:00', 480, 'LOCAL-B', 'Other squad entry', 'pending'),
  (:'inactive_id', '2026-01-05', '08:00', '17:00', 480, 'LOCAL-INACTIVE', 'Inactive collaborator entry', 'pending');

insert into public.access_preapprovals (email, full_name, role, active)
values ('local-preapproval@example.invalid', 'Synthetic Preapproval', 'colaborador', true);
SQL

INACTIVE_ENTRY_ID="$(psql "$DB_URL" --set ON_ERROR_STOP=1 --tuples-only --no-align -c "select id from public.time_entries where profile_id = '$INACTIVE_ID' limit 1")"

COLLAB_TOKEN="$(login_user collab@example.invalid)"
SUPERVISOR_TOKEN="$(login_user supervisor@example.invalid)"
OTHER_SUPERVISOR_TOKEN="$(login_user other-supervisor@example.invalid)"
DIRECTOR_TOKEN="$(login_user director@example.invalid)"
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
expected="$(jq -cn --arg id "$COLLAB_ID" '[$id]')"
assert_ids 'supervisor squad entries' "$status" "$expected"

status="$(request_status GET "$API_URL/rest/v1/time_entries?select=profile_id&profile_id=eq.$COLLAB_ID" "$OTHER_SUPERVISOR_TOKEN")"
[[ "$status" =~ ^2 ]] || { echo "other supervisor request failed: HTTP $status" >&2; exit 1; }
[[ "$(jq 'length' "$tmp_dir/response")" -eq 0 ]] || { echo 'other supervisor saw another squad entry' >&2; exit 1; }

status="$(request_status GET "$API_URL/rest/v1/time_entries?select=profile_id" "$DIRECTOR_TOKEN")"
[[ "$status" =~ ^2 ]] || { echo "director read failed: HTTP $status" >&2; exit 1; }
[[ "$(jq 'length' "$tmp_dir/response")" -eq 2 ]] || { echo 'director did not see both synthetic entries' >&2; exit 1; }

for token in "$INACTIVE_TOKEN" "$UNLINKED_TOKEN"; do
  status="$(request_status GET "$API_URL/rest/v1/profiles?select=id" "$token")"
  [[ "$status" =~ ^2 ]] || { echo "unlinked/inactive profile request failed: HTTP $status" >&2; exit 1; }
  [[ "$(jq 'length' "$tmp_dir/response")" -eq 0 ]] || { echo 'unlinked or inactive user received a profile' >&2; exit 1; }
done

status="$(request_status GET "$API_URL/rest/v1/profiles?select=id")"
[[ ! "$status" =~ ^2 ]] || { echo 'anon unexpectedly read profiles' >&2; exit 1; }

status="$(request_status GET "$API_URL/rest/v1/access_preapprovals?select=email" "$COLLAB_TOKEN")"
[[ ! "$status" =~ ^2 ]] || { echo 'authenticated user unexpectedly read access_preapprovals' >&2; exit 1; }

status="$(request_status PATCH "$API_URL/rest/v1/profiles?id=eq.$COLLAB_ID" "$COLLAB_TOKEN" '{"role":"diretor","auth_user_id":"00000000-0000-0000-0000-000000000099"}')"
[[ ! "$status" =~ ^2 ]] || { [[ ! -s "$tmp_dir/response" || "$(jq 'length' "$tmp_dir/response")" -eq 0 ]] || { echo 'direct role/auth_user_id update unexpectedly succeeded' >&2; exit 1; }; }

status="$(request_status POST "$API_URL/rest/v1/time_entries" "$COLLAB_TOKEN" '{"profile_id":"'"$COLLAB_ID"'","date":"2026-01-07","duration_minutes":90,"client_name":"Synthetic Client","project_code":"LOCAL-RICH","contractor_number":"CONTRACT-7","activity_id":"activity-7","discipline_code":"E","document_type_code":"RN","description":"Persisted from Data API","status":"pending"}')"
[[ "$status" =~ ^2 ]] || { echo "rich time entry insert failed: HTTP $status" >&2; cat "$tmp_dir/response" >&2; exit 1; }
ENTRY_ID="$(jq -er '.[0].id // .id' "$tmp_dir/response")"

status="$(request_status POST "$API_URL/rest/v1/rpc/decide_time_entry" "$SUPERVISOR_TOKEN" '{"target_entry_id":"'"$ENTRY_ID"'","expected_version":1,"decision":"approved","p_rejection_reason":null}')"
[[ "$status" =~ ^2 ]] || { echo "supervisor approval RPC failed: HTTP $status" >&2; cat "$tmp_dir/response" >&2; exit 1; }
[[ "$(jq -r '.[0].status // .status' "$tmp_dir/response")" == 'approved' ]] || { echo 'approval RPC did not persist approved status' >&2; exit 1; }

status="$(request_status POST "$API_URL/rest/v1/time_entries" "$COLLAB_TOKEN" '{"profile_id":"'"$COLLAB_ID"'","date":"2026-01-08","duration_minutes":45,"client_name":"Synthetic Client","project_code":"LOCAL-REJECT","activity_id":"activity-8","discipline_code":"E","document_type_code":"RN","description":"Rejected synthetic entry","status":"pending"}')"
[[ "$status" =~ ^2 ]] || { echo "rejection fixture insert failed: HTTP $status" >&2; exit 1; }
REJECT_ENTRY_ID="$(jq -er '.[0].id // .id' "$tmp_dir/response")"
status="$(request_status POST "$API_URL/rest/v1/rpc/decide_time_entry" "$SUPERVISOR_TOKEN" '{"target_entry_id":"'"$REJECT_ENTRY_ID"'","expected_version":1,"decision":"rejected","p_rejection_reason":"Detalhar a atividade registrada."}')"
[[ "$status" =~ ^2 ]] || { echo "supervisor rejection RPC failed: HTTP $status" >&2; cat "$tmp_dir/response" >&2; exit 1; }
[[ "$(jq -r '.[0].status // .status' "$tmp_dir/response")" == 'rejected' ]] || { echo 'rejection RPC did not persist rejected status' >&2; exit 1; }

status="$(request_status PATCH "$API_URL/rest/v1/time_entries?id=eq.$ENTRY_ID" "$SUPERVISOR_TOKEN" '{"description":"forged supervisor update"}')"
[[ ! "$status" =~ ^2 ]] || { [[ ! -s "$tmp_dir/response" || "$(jq 'length' "$tmp_dir/response")" -eq 0 ]] || { echo 'supervisor direct update unexpectedly succeeded' >&2; exit 1; }; }

status="$(request_status PATCH "$API_URL/rest/v1/time_entries?id=eq.$ENTRY_ID" "$COLLAB_TOKEN" '{"status":"rejected","rejection_reason":"forged decision","decided_by":"'$SUPERVISOR_ID'","decided_at":"2026-01-05T12:00:00Z"}')"
[[ ! "$status" =~ ^2 ]] || { [[ ! -s "$tmp_dir/response" || "$(jq 'length' "$tmp_dir/response")" -eq 0 ]] || { echo 'collaborator directly changed decision metadata' >&2; exit 1; }; }

status="$(request_status POST "$API_URL/rest/v1/rpc/decide_time_entry" "$SUPERVISOR_TOKEN" '{"target_entry_id":"'"$INACTIVE_ENTRY_ID"'","expected_version":1,"decision":"approved","p_rejection_reason":null}')"
[[ ! "$status" =~ ^2 ]] || { echo 'inactive profile entry was approved unexpectedly' >&2; exit 1; }

status="$(request_status GET "$API_URL/rest/v1/time_entries?id=eq.$ENTRY_ID&select=id,status,client_name,activity_id" "$COLLAB_TOKEN")"
[[ "$status" =~ ^2 ]] || { echo "collaborator persisted read failed: HTTP $status" >&2; exit 1; }
[[ "$(jq -r '.[0].status' "$tmp_dir/response")" == 'approved' ]] || { echo 'collaborator did not see persisted approval' >&2; exit 1; }
[[ "$(jq -r '.[0].client_name' "$tmp_dir/response")" == 'Synthetic Client' ]] || { echo 'rich client field was lost' >&2; exit 1; }

status="$(request_status POST "$API_URL/rest/v1/time_entries" "$COLLAB_TOKEN" '{"profile_id":"00000000-0000-0000-0000-000000000099","date":"2026-01-06","start_time":"08:00","end_time":"09:00","duration_minutes":60,"project_code":"FORBIDDEN","status":"pending"}')"
[[ ! "$status" =~ ^2 ]] || { echo 'cross-profile time entry insert unexpectedly succeeded' >&2; exit 1; }

echo 'Supabase local Auth/Data API/RLS integration checks passed.'
