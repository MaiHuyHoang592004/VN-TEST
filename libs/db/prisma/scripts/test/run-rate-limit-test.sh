#!/usr/bin/env bash
# Rate-limit invariants against a throwaway database. The key guarantee —
# concurrent attempts cannot exceed the limit — is Postgres behaviour, so it
# needs a real database, not a fake.
set -euo pipefail

DB="${RATELIMIT_TEST_DB:-opcreative_ratelimit_test}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$HERE/../../.." && pwd)"

cleanup() { dropdb --if-exists "$DB" 2>/dev/null || true; }
trap cleanup EXIT
cleanup; createdb "$DB"

if [[ -f "$PKG_ROOT/.env.local" ]]; then
  set -a; . "$PKG_ROOT/.env.local"; set +a
  export DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed -E "s#/[^/?]+(\?|$)#/$DB\1#")"
else
  export DATABASE_URL="postgresql://${PGUSER:-postgres}:${PGPASSWORD:-postgres}@${PGHOST:-localhost}:${PGPORT:-5432}/$DB?schema=public"
fi

echo "==> migrating scratch DB $DB"
(cd "$PKG_ROOT" && npx prisma migrate deploy --config prisma/config/prisma.config.ts >/dev/null)

echo "==> running rate-limit invariants"
node --test "$PKG_ROOT/src/rate-limit.test.ts"
