#!/usr/bin/env bash
# Apply ONLY 20260921120000_sanitize_email_display_names.sql and record it in
# supabase_migrations.schema_migrations — without `supabase db push` (which would
# apply unrelated pending migrations).
#
# Prerequisites:
#   - Verified platform snapshot / logical backup of the TARGET database
#   - Dry-run counts reviewed (sanitize_email_display_names_dry_run.sql)
#   - Not for production unless explicitly approved
#
# Usage (local docker Supabase example):
#   ./supabase/sql/sanitize_email_display_names_apply_one.sh supabase_db_Gymly-1 postgres
#
set -euo pipefail

DB_CONTAINER="${1:?docker db container name}"
DB_NAME="${2:-postgres}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# script lives in supabase/sql/ → repo root is ../..
MIGRATION="$ROOT/supabase/migrations/20260921120000_sanitize_email_display_names.sql"
VERSION="20260921120000"
NAME="sanitize_email_display_names"

if [[ ! -f "$MIGRATION" ]]; then
  echo "missing migration: $MIGRATION" >&2
  exit 1
fi

echo "Applying $VERSION to database=$DB_NAME in container=$DB_CONTAINER"
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$DB_NAME" < "$MIGRATION"

echo "Recording schema_migrations row if absent"
docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$DB_NAME" <<SQL
insert into supabase_migrations.schema_migrations (version, name, statements)
select '$VERSION', '$NAME', array['applied via sanitize_email_display_names_apply_one.sh']
where not exists (
  select 1 from supabase_migrations.schema_migrations where version = '$VERSION'
);
select version, name from supabase_migrations.schema_migrations where version = '$VERSION';
SQL

echo "Done. Run supabase/tests/sanitize_email_display_names_rules.sql next."
