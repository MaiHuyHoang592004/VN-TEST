#!/usr/bin/env bash
# Money invariants against a throwaway database. Builds a scratch DB, applies
# the real migrations, runs the integration test, drops the DB. Touches neither
# local dev nor prod.
set -euo pipefail

DB="${MONEY_TEST_DB:-opcreative_money_test}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"

cleanup() { dropdb --if-exists "$DB" 2>/dev/null || true; }
trap cleanup EXIT
cleanup; createdb "$DB"

# Local: reuse .env.local's credentials/host, swapping only the DB name.
# CI: no .env.local — build the URL from the standard PG* vars instead.
if [[ -f "$REPO/libs/db/.env.local" ]]; then
  set -a; . "$REPO/libs/db/.env.local"; set +a
  export DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed -E "s#/[^/?]+(\?|$)#/$DB\1#")"
else
  export DATABASE_URL="postgresql://${PGUSER:-postgres}:${PGPASSWORD:-postgres}@${PGHOST:-localhost}:${PGPORT:-5432}/$DB?schema=public"
fi
export AUTH_SECRET="money-test" AUTH_OTP_CONSOLE=1

echo "==> migrating scratch DB $DB"
(cd "$REPO/libs/db" && npx prisma migrate deploy --config prisma/config/prisma.config.ts >/dev/null)

# A glob, not a file list: every *.test.ts under src/ runs here, so a new suite
# is wired into CI by existing, not by editing this file.
#
# Widened from modules/ to src/ — that glob silently orphaned every test
# outside the modules tree (import-columns.test.ts had been green and unrun for
# weeks, and config/nav-tabs.test.ts would have been born unrun). Pure unit
# suites cost nothing extra here: the scratch DB is already up.
# --test-concurrency=1: these files SHARE one database, so running them in
# parallel processes lets one file's cleanup race another file's query. The
# real failure this fixes: notification audiences are derived from
# ROLE_PERMISSIONS, so they select EVERY matching user in the database —
# including users another test file created — and skus/products hard-delete
# theirs in cleanup, so the insert hit a foreign key on a user that vanished
# mid-test. Latent since those suites were written; adding two inventory files
# just widened the window enough to fire it.
#
# Serialising is the honest fix rather than making notifyMany tolerate missing
# users: production NEVER hard-deletes a user (soft delete only, see
# users/service.ts), so that tolerance would exist purely to paper over test
# pollution. Cost is wall clock (~16s → ~41s), which is worth determinism in
# the suite that guards money and stock.
#
# Concurrency INSIDE a file is unaffected — the double-receive and
# double-reserve races still run under Promise.all, and must.
echo "==> running integration and unit suites"
node --test --test-concurrency=1 "$HERE/../src/**/*.test.ts"
