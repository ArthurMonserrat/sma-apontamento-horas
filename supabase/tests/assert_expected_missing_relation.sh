#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "usage: $0 <host> <port> <database> <migration-file>" >&2
  exit 2
fi

host="$1"
port="$2"
database="$3"
migration_file="$4"
log_file="$(mktemp)"
trap 'rm -f "$log_file"' EXIT

set +e
PGPASSWORD="${PGPASSWORD:?PGPASSWORD must be set}" psql \
  --no-psqlrc \
  --set ON_ERROR_STOP=1 \
  --echo-errors \
  --set=VERBOSITY=verbose \
  --host "$host" \
  --port "$port" \
  --username postgres \
  --dbname "$database" \
  --file "$migration_file" >"$log_file" 2>&1
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  echo "Stage 3B.1 unexpectedly succeeded; the historical incompatibility was not detected." >&2
  exit 1
fi

if ! grep -Eq 'ERROR:[[:space:]]+42P01:[[:space:]]+relation "public\.access_preapprovals" does not exist' "$log_file"; then
  echo "Stage 3B.1 failed, but not with the expected missing access_preapprovals relation (SQLSTATE 42P01)." >&2
  cat "$log_file" >&2
  exit 1
fi

echo "Expected incompatibility confirmed: SQLSTATE 42P01, public.access_preapprovals is absent."
