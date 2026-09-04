#!/usr/bin/env bash
# =============================================================================
# Rehearse the legacy cutover against a scratch database.
#
#   cd libs/db && ./prisma/scripts/test/run-cutover-test.sh
#
# Builds a throwaway database, applies the real migrations, loads the synthetic
# legacy fixture, runs the real migrate-legacy.sql, then asserts the results.
# Exits non-zero on the first failure. Touches nothing else: not local dev, and
# certainly not prod.
#
# LIMIT: the fixture mirrors the ARCHIVED legacy schema, which trails the real
# legacy production database. Green here means the cutover is self-consistent —
# it does not prove the script matches live prod data. Rehearse against a real
# pg_dump before the actual cutover.
# =============================================================================
set -euo pipefail

DB="${CUTOVER_TEST_DB:-gwprint_cutover_test}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$HERE/../../.." && pwd)"

cleanup() { dropdb --if-exists "$DB" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> Scratch database: $DB"
cleanup
createdb "$DB"

# Local: reuse .env.local's credentials/host, swapping only the database name,
# so this works wherever local dev works instead of guessing an auth method.
# CI: there is no .env.local — build the URL from the standard PG* vars, which
# is what the workflow sets. The old bare-localhost fallback assumed trust auth
# and failed CI with P1010.
if [[ -f "$PKG_ROOT/.env.local" ]]; then
  set -a; . "$PKG_ROOT/.env.local"; set +a   # sourcing handles the quoting for us
  export DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed -E "s#/[^/?]+(\?|$)#/$DB\1#")"
else
  export DATABASE_URL="postgresql://${PGUSER:-postgres}:${PGPASSWORD:-postgres}@${PGHOST:-localhost}:${PGPORT:-5432}/$DB?schema=public"
fi

echo "==> Applying migrations"
(cd "$PKG_ROOT" && npx prisma migrate deploy --config prisma/config/prisma.config.ts >/dev/null)

echo "==> Loading legacy fixture"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/legacy-fixture.sql"

echo "==> Running cutover (prisma/scripts/migrate-legacy.sql)"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$PKG_ROOT/prisma/scripts/migrate-legacy.sql"

echo "==> Asserting results"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/cutover-assertions.sql"

# The inventory extension runs SECOND and depends on the first: it resolves
# materials against users, warehouses, product_variants and orders that the
# main script creates. Running it alone against an empty database would report
# every row as an orphan and pass, which is why it is not its own harness.
echo "==> Running inventory cutover (prisma/scripts/migrate-legacy-inventory.sql)"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$PKG_ROOT/prisma/scripts/migrate-legacy-inventory.sql"

echo "==> Asserting inventory results"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/cutover-inventory-assertions.sql"

echo
echo "==> Orphans and fallbacks recorded (a clean cutover is a READ report, not an empty one)"
psql -q -d "$DB" -c "SELECT step, issue, count(*) FROM migration_report GROUP BY 1,2 ORDER BY 1,2;"

echo
echo "PASS — cutover rehearsal succeeded."
