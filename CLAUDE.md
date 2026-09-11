# FulfillFlow — Turborepo monorepo (NestJS api + worker, Prisma 7, PostgreSQL)

Exception-driven Shopify fulfillment automation. Legacy gwprint v1 lives on branch `legacy/gwprint-v1` (tag `v1-legacy`); never merge it back.

- `libs/db` → `@fulfillflow/db`: Prisma 7 multi-file schema (`prisma/schema/main.prisma`, `enums/`, `models/*.prisma`), migrations, seed, raw-SQL queue helpers. Built with tsc to `dist/`.
- `apps/api` → NestJS 11 (ESM, SWC). Webhooks + merchant/operator HTTP API.
- `apps/worker` → NestJS application context. Ingestion + outbox loops (Postgres `FOR UPDATE SKIP LOCKED` + lease; no Redis).
- Design docs: `docs/superpowers/specs/`, ADRs in `docs/adr/`.

## Rules
- NEVER `prisma db push` or `prisma migrate reset` on a shared DB. Schema change = edit models → `npm run db:migrate -- --name <change>` (from `libs/db`) → commit the migration. Local fresh DB: `scripts/db-fresh-local.sh`.
- Partial indexes are declared in Prisma (`partialIndexes` preview). CHECK constraints live in migration SQL; keep them in sync with `docs/adr/ADR-07-db-constraints.md`.
- Every DateTime is `@db.Timestamptz(3)`; ids are `uuid(7)`.
- Tests: `node --test`. DB tests need `DATABASE_URL` pointing at a disposable Postgres.
- Tenant boundary: `organizationId` always comes from `TenantContext`, never from request body/query.
