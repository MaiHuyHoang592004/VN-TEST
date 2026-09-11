#!/usr/bin/env bash
# LOCAL ONLY. Drops and recreates the local dev database, applies migrations, seeds.
# Refuses to run unless DATABASE_URL points at localhost.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-libs/db/.env.local}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a
: "${DATABASE_URL:?DATABASE_URL required}"
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "refusing: DATABASE_URL is not local"; exit 1 ;;
esac
DB_NAME="${DATABASE_URL##*/}"; DB_NAME="${DB_NAME%%\?*}"
ADMIN_URL="${DATABASE_URL%/*}/postgres"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);" -c "CREATE DATABASE \"$DB_NAME\";"
npm run db:migrate:deploy -w @fulfillflow/db
npm run db:seed -w @fulfillflow/db
echo "fresh local DB ready: $DB_NAME"
