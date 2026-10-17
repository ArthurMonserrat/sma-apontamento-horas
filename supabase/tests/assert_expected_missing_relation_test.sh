#!/usr/bin/env bash
set -euo pipefail

test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT

cat > "$test_dir/psql" <<'EOF'
#!/usr/bin/env bash
case "${FAKE_PSQL_MODE:?}" in
  expected)
    echo 'ERROR:  42P01: relation "public.access_preapprovals" does not exist' >&2
    exit 3
    ;;
  wrong_relation)
    echo 'ERROR:  42P01: relation "public.other_table" does not exist' >&2
    exit 3
    ;;
  success)
    exit 0
    ;;
esac
EOF
chmod +x "$test_dir/psql"

run_helper() {
  FAKE_PSQL_MODE="$1" PGPASSWORD=synthetic PATH="$test_dir:$PATH" \
    bash supabase/tests/assert_expected_missing_relation.sh localhost 5432 test migration.sql
}

run_helper expected >/dev/null

if run_helper wrong_relation >/dev/null 2>&1; then
  echo 'unexpected relation failure was incorrectly accepted' >&2
  exit 1
fi

if run_helper success >/dev/null 2>&1; then
  echo 'unexpected migration success was incorrectly accepted' >&2
  exit 1
fi

echo 'Unexpected SQL errors and unexpected success are rejected.'
