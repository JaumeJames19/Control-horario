#!/usr/bin/env bash
# Aplica todas las migraciones en una base de datos vacía y ejecuta supabase/tests/reglas.sql.
# Necesita un Postgres local; la conexión se toma de las variables PG* (PGHOST, PGPORT, PGUSER…).
# Uso: PGHOST=localhost PGUSER=postgres scripts/test-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-fichaje_test}"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/stub_supabase.sql
for f in drizzle/migrations/[0-9]*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null; done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/reglas.sql
