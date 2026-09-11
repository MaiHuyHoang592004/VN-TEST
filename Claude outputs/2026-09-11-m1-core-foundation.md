# FulfillFlow M1 — Core Foundation (PR-01 schema V2.1 + PR-02 api/worker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the VN-TEST repo into the FulfillFlow V2.1 foundation: a fresh Prisma schema + migration history, a synthetic seed, a NestJS `api` with a durable-insert-ready HTTP layer, and a NestJS `worker` with a Postgres `SKIP LOCKED` + lease job loop — all tested, all green in CI. Nothing Shopify-specific yet; the next plan (M2: Shopify shell + auth + webhook intake) plugs into this.

**Architecture:** Same monorepo (npm workspaces + Turbo 2). Legacy `apps/dashboard`, `apps/storefront`, `libs/auth` are frozen on branch `legacy/gwprint-v1` and removed from `main`. `libs/db` becomes a compiled ESM package (tsc → `dist/`) holding the V2.1 schema, migrations, seed and raw-SQL helpers. `apps/api` (NestJS 11, SWC, ESM) exposes `/health` and the module skeleton; `apps/worker` (same NestJS codebase pattern, application-context only) runs the generic queue loop used later by ingestion and outbox.

**Tech Stack:** Node 22, TypeScript 6, npm workspaces, Turbo 2, Prisma 7.8 (`prisma-client` generator, `@prisma/adapter-pg`, `partialIndexes` preview), PostgreSQL 17, NestJS 11 + SWC, `node:test`, `@swc-node/register`, zod, supertest, GitHub Actions with a Postgres service container.

**Spec:** `fulfillflow/specs/2026-09-11-shopify-connect-design.md` (Project) + `fulfillflow/v2-schema-review.md` + canonical schema `schema-v2.1.prisma` (validated: 35 models / 28 enums).

## Global Constraints

- Prisma: **never** `prisma db push` / `prisma migrate reset` against any shared DB. Local dev uses the fresh-DB script in Task 2 (drop/create the *local* database only).
- Every `DateTime` column is `@db.Timestamptz(3)`; every id is `String @default(uuid(7))`; money is `Decimal(14,4)`; inventory quantities are `Decimal(18,6)`.
- Partial indexes are declared in the Prisma schema (`previewFeatures = ["partialIndexes"]`), never hand-written in SQL. CHECK constraints are hand-written SQL inside the init migration.
- Tests use `node:test` (`node --test`) everywhere; DB tests run against a real Postgres (`DATABASE_URL`), never an in-memory fake.
- `apps/api` and `apps/worker` are ESM (`"type": "module"`), imports of local files use the `.js` extension, NestJS DI relies on SWC `decoratorMetadata`.
- No legacy names anywhere on `main` after Task 1: no `gwprint`, `BasketPosition`, `MaterialStock`, `WarehouseInventory`, `tier`, `configs.legacy`.
- Commit messages: Conventional Commits; one PR per task group as labeled (PR-01 = Tasks 1–4, PR-02 = Tasks 5–7).

---

## Decision D1 (confirm before Task 1)

Rewrite happens **in the VN-TEST repo** (your stated intent), with a fresh migration history and no data migration. Provenance caveat, stated once: git history on `main` still contains the old company code. If you want clean-room separation, run Task 1 on a brand-new repo created with `git init` and copy nothing but `libs/db/prisma/config/prisma.config.ts`, `.github/workflows/ci.yml` and the root tooling files; every task from Task 2 onward is identical. Decide before starting; the plan does not branch on it afterwards.

---

## File structure after M1

```
fulfillflow/
  package.json                 workspaces apps/* libs/*, root scripts test/build/lint
  turbo.json                   build/test/lint/dev pipelines
  .github/workflows/ci.yml     postgres service, validate, migrate, drift, test
  scripts/db-fresh-local.sh    LOCAL ONLY drop/create + migrate + seed
  libs/db/
    package.json               @fulfillflow/db, main dist/index.js, build via tsc
    tsconfig.build.json
    prisma/config/prisma.config.ts
    prisma/schema/main.prisma  generator + datasource (partialIndexes)
    prisma/schema/enums/enums.prisma
    prisma/schema/models/*.prisma   one file per model (35 files)
    prisma/migrations/20260912000000_v2_init/migration.sql   generated + CHECK constraints appended
    prisma/scripts/seed-v2.ts
    src/index.ts               re-exports client + queue + generated types
    src/client.ts              PrismaClient singleton (adapter-pg)
    src/queue.ts               claimOutbox / claimIngestion / completeOutbox / failOutbox (raw SQL)
    src/queue.test.ts
    src/seed.test.ts
  libs/shared/                 kept; drive/ removed in Task 1
  apps/api/
    package.json  nest-cli.json  .swcrc  tsconfig.json
    src/main.ts                NestFactory with rawBody: true, port from env
    src/app.module.ts
    src/config/env.ts          zod schema + loader
    src/prisma/prisma.module.ts, prisma.service.ts
    src/health/health.controller.ts, health.controller.test.ts
    Dockerfile  railway.json
  apps/worker/
    package.json  nest-cli.json  .swcrc  tsconfig.json
    src/main.ts                createApplicationContext + loop + SIGTERM
    src/worker.module.ts
    src/queue/handler-registry.ts   Map<string, OutboxHandler>
    src/queue/outbox-loop.ts        poll → claim → dispatch → complete/fail
    src/queue/outbox-loop.test.ts
    src/handlers/noop-echo.handler.ts
    Dockerfile  railway.json
```

---

### Task 1: Freeze legacy and restructure the monorepo (PR-01, part 1)

**Files:**
- Create: branch `legacy/gwprint-v1`, tag `v1-legacy`
- Delete from `main`: `apps/dashboard/`, `apps/storefront/`, `libs/auth/`, `libs/shared/src/drive/`, `libs/db/prisma/scripts/*` (all legacy scripts), `libs/db/src/drive-mockups.ts`, `libs/db/src/access/`, `libs/db/src/audit.ts`, `libs/db/src/rate-limit*.ts`, `railway.json` (root)
- Modify: `package.json` (root), `turbo.json`, `CLAUDE.md`, `README.md`, `libs/shared/src/index.ts`

**Interfaces:**
- Produces: workspace names `@fulfillflow/db`, `@fulfillflow/shared`; root scripts `build`, `test`, `lint`, `dev`.

- [ ] **Step 1: Freeze the legacy tree**

```bash
git checkout main && git pull
git branch legacy/gwprint-v1
git tag -a v1-legacy -m "gwprint v1 frozen before FulfillFlow V2.1 rewrite"
git push origin legacy/gwprint-v1 v1-legacy
git checkout -b ff/m1-foundation
```

- [ ] **Step 2: Remove legacy apps and libs from main**

```bash
git rm -r apps/dashboard apps/storefront libs/auth libs/shared/src/drive \
  libs/db/prisma/scripts libs/db/src/drive-mockups.ts libs/db/src/access \
  libs/db/src/audit.ts libs/db/src/rate-limit.ts libs/db/src/rate-limit.test.ts railway.json
```

- [ ] **Step 3: Rewrite root `package.json`**

```json
{
  "name": "fulfillflow",
  "version": "0.1.0",
  "private": true,
  "license": "MIT",
  "packageManager": "npm@11.12.1",
  "engines": { "node": ">=22.12" },
  "workspaces": ["apps/*", "libs/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "db:validate": "npm run db:validate -w @fulfillflow/db",
    "db:migrate": "npm run db:migrate -w @fulfillflow/db",
    "db:seed": "npm run db:seed -w @fulfillflow/db"
  },
  "devDependencies": {
    "prettier": "^3.8.1",
    "turbo": "^2.10.5",
    "typescript": "~6.0.3"
  }
}
```

- [ ] **Step 4: Rewrite `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "env": ["DATABASE_URL", "NODE_ENV"]
    },
    "test": {
      "dependsOn": ["build"],
      "cache": false,
      "env": ["DATABASE_URL", "NODE_ENV"]
    },
    "dev": { "cache": false, "persistent": true },
    "start": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^lint"] }
  }
}
```

- [ ] **Step 5: Trim `libs/shared/src/index.ts`** to export only what remains (the `access/` scopes module if it is generic; delete the `drive` export line). Rename package to `@fulfillflow/shared` in `libs/shared/package.json` and update the dependency name in `libs/db/package.json`.

- [ ] **Step 6: Replace `CLAUDE.md`** with the V2 conventions (keep it short; it is the future-you contract):

```markdown
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
```

- [ ] **Step 7: Verify the workspace still installs and builds with the remaining packages**

Run: `npm install && npm run build`
Expected: Turbo runs `build` for `@fulfillflow/shared` and `@fulfillflow/db` (db build is added in Task 2; at this point `libs/db` has no `build` script yet, Turbo skips it) with exit code 0. `git grep -n "gwprint" -- ':!CLAUDE.md' ':!README.md'` returns nothing except `package-lock.json` (regenerated in Task 2).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(repo): freeze gwprint v1 on legacy branch, start FulfillFlow V2.1 monorepo"
```

---

### Task 2: Schema V2.1 + fresh migration history with CHECK constraints (PR-01, part 2)

**Files:**
- Create: `libs/db/prisma/schema/enums/enums.prisma`, `libs/db/prisma/schema/models/<model>.prisma` × 35, `libs/db/prisma/migrations/20260912000000_v2_init/migration.sql`, `libs/db/tsconfig.build.json`, `scripts/db-fresh-local.sh`, `docs/adr/ADR-07-db-constraints.md`
- Modify: `libs/db/prisma/schema/main.prisma`, `libs/db/package.json`, `libs/db/src/index.ts`, `libs/db/src/client.ts`
- Delete: all old `libs/db/prisma/schema/models/*.prisma`, `enums/enums.prisma`, `libs/db/prisma/migrations/*`

**Interfaces:**
- Produces: `@fulfillflow/db` exports `prisma` (PrismaClient singleton), all generated model types, and (Task 3/6) `seedV2()`, `claimOutbox()`, `completeOutbox()`, `failOutbox()`, `claimIngestion()`.

- [ ] **Step 1: Delete the old schema and migrations**

```bash
cd libs/db
git rm -r prisma/schema/models prisma/schema/enums prisma/migrations
mkdir -p prisma/schema/models prisma/schema/enums prisma/migrations
```

- [ ] **Step 2: Write `prisma/schema/main.prisma`**

```prisma
// FulfillFlow V2.1 — generator + datasource only. Enums in enums/, one model per file in models/.
generator client {
  provider        = "prisma-client"
  output          = "../../src/generated/prisma"
  previewFeatures = ["partialIndexes"]
}

datasource db {
  provider = "postgresql"
}
```

- [ ] **Step 3: Split `schema-v2.1.prisma` into files**

Copy the `enum` blocks from `schema-v2.1.prisma` verbatim into `prisma/schema/enums/enums.prisma`. Copy each `model X { … }` block verbatim into `prisma/schema/models/<kebab-name>.prisma` (`user.prisma`, `organization.prisma`, `organization-membership.prisma`, `store.prisma`, `store-sku-mapping.prisma`, `product.prisma`, `inventory-item.prisma`, `sku.prisma`, `price-list.prisma`, `price-list-item.prisma`, `bom-revision.prisma`, `bom-component.prisma`, `facility.prisma`, `facility-membership.prisma`, `facility-sku-capability.prisma`, `facility-location.prisma`, `inventory-balance.prisma`, `inventory-reservation.prisma`, `inventory-movement.prisma`, `ingestion-batch.prisma`, `ingestion-record.prisma`, `order.prisma`, `order-address.prisma`, `order-item.prisma`, `routing-decision.prisma`, `fulfillment.prisma`, `fulfillment-item.prisma`, `shipment.prisma`, `shipment-item.prisma`, `shopify-fulfillment-order-line.prisma`, `exception-case.prisma`, `outbox-event.prisma`, `delivery-attempt.prisma`, `api-idempotency-key.prisma`, `audit-log.prisma`). Do not edit the content while splitting.

- [ ] **Step 4: Validate**

Run: `npm run db:validate -w @fulfillflow/db`
Expected: `The schema at prisma/schema is valid 🚀`. If it reports an unknown `previewFeatures` value, the installed Prisma is < 7.4: run `npm i -w @fulfillflow/db prisma@^7.8 @prisma/client@^7.8 @prisma/adapter-pg@^7.8` and retry.

- [ ] **Step 5: Create the local fresh-DB script `scripts/db-fresh-local.sh`**

```bash
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
```

`chmod +x scripts/db-fresh-local.sh`. (On Windows run it from Git Bash; `psql` must be on PATH.)

- [ ] **Step 6: Generate the init migration without applying, then append CHECK constraints**

Run (from `libs/db`, with `.env.local` pointing at an empty local DB `fulfillflow_local`):

```bash
npx prisma migrate dev --config prisma/config/prisma.config.ts --create-only --name v2_init
```

Expected: `prisma/migrations/<timestamp>_v2_init/migration.sql` created, not applied. Rename the folder to `20260912000000_v2_init`. Append to the end of `migration.sql`:

```sql
-- ============ FulfillFlow invariants (hand-written; see docs/adr/ADR-07-db-constraints.md) ============
ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT balance_nonneg CHECK ("onHand" >= 0 AND "reserved" >= 0),
  ADD CONSTRAINT balance_reserved_within_onhand CHECK ("reserved" <= "onHand");

ALTER TABLE "InventoryReservation"
  ADD CONSTRAINT reservation_qty CHECK ("quantity" > 0 AND "consumedQuantity" >= 0 AND "consumedQuantity" <= "quantity");

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT movement_not_noop CHECK ("onHandDelta" <> 0 OR "reservedDelta" <> 0);

ALTER TABLE "OrderItem"       ADD CONSTRAINT order_item_qty CHECK ("quantity" > 0);
ALTER TABLE "FulfillmentItem" ADD CONSTRAINT fulfillment_item_qty
  CHECK ("quantity" > 0 AND "producedQuantity" >= 0 AND "producedQuantity" <= "quantity");
ALTER TABLE "ShipmentItem"    ADD CONSTRAINT shipment_item_qty CHECK ("quantity" > 0);
ALTER TABLE "ShopifyFulfillmentOrderLine" ADD CONSTRAINT sfol_remaining_nonneg CHECK ("remainingQuantity" >= 0);

ALTER TABLE "BomComponent"
  ADD CONSTRAINT bom_component_qty CHECK ("quantityPerUnit" > 0 AND "wastageRate" >= 0 AND "wastageRate" < 1);
ALTER TABLE "PriceListItem"
  ADD CONSTRAINT price_item CHECK ("minQuantity" >= 1 AND "unitPrice" >= 0);

ALTER TABLE "ExceptionCase"
  ADD CONSTRAINT exception_has_subject
  CHECK (num_nonnulls("ingestionRecordId", "orderId", "fulfillmentId", "shipmentId") >= 1 OR "subjectKey" LIKE 'store:%');

ALTER TABLE "OutboxEvent" ADD CONSTRAINT outbox_attempts_nonneg CHECK ("attempts" >= 0);
ALTER TABLE "IngestionRecord" ADD CONSTRAINT ingestion_attempts_nonneg CHECK ("attempts" >= 0);
```

- [ ] **Step 7: Apply and verify no drift**

```bash
npx prisma migrate dev --config prisma/config/prisma.config.ts
npx prisma migrate diff --config prisma/config/prisma.config.ts \
  --from-migrations prisma/migrations --to-schema-datamodel prisma/schema \
  --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code
```

Expected: first command applies `20260912000000_v2_init` and generates the client; second prints `No difference detected.` and exits 0. (`SHADOW_DATABASE_URL` = a second empty local DB, e.g. `postgresql://…/fulfillflow_shadow`.) If diff reports the partial indexes as drift, Prisma is at 7.4.1 with the known bug — upgrade to the latest 7.x and rerun; do not "fix" by removing the indexes.

- [ ] **Step 8: Make `libs/db` a compiled ESM package**

`libs/db/package.json`:

```json
{
  "name": "@fulfillflow/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "postinstall": "prisma generate --config prisma/config/prisma.config.ts",
    "db:generate": "prisma generate --config prisma/config/prisma.config.ts",
    "db:validate": "prisma validate --config prisma/config/prisma.config.ts",
    "db:migrate": "prisma migrate dev --config prisma/config/prisma.config.ts",
    "db:migrate:deploy": "prisma migrate deploy --config prisma/config/prisma.config.ts",
    "db:migrate:prod": "ENV_FILE=.env.prod prisma migrate deploy --config prisma/config/prisma.config.ts",
    "db:diff": "prisma migrate diff --config prisma/config/prisma.config.ts --from-migrations prisma/migrations --to-schema-datamodel prisma/schema --shadow-database-url \"$SHADOW_DATABASE_URL\" --exit-code",
    "db:seed": "node --env-file-if-exists=${ENV_FILE:-.env.local} --experimental-strip-types prisma/scripts/seed-v2.ts",
    "build": "tsc -p tsconfig.build.json",
    "test": "node --env-file-if-exists=${ENV_FILE:-.env.local} --experimental-strip-types --test src/**/*.test.ts"
  },
  "dependencies": {
    "@fulfillflow/shared": "*",
    "@prisma/adapter-pg": "^7.8.0",
    "@prisma/client": "^7.8.0"
  },
  "devDependencies": { "prisma": "^7.8.0" }
}
```

`libs/db/tsconfig.build.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rewriteRelativeImportExtensions": true,
    "declaration": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

`rewriteRelativeImportExtensions` lets source keep `./client.ts` imports (repo convention, works with `--experimental-strip-types` for scripts/tests) while `dist/` gets `./client.js`. Open `src/generated/prisma/client.ts`: if its relative imports end in `.ts`, nothing else is needed; if they end in `.js`, also nothing (tsc leaves them). Either way the build must pass.

`libs/db/src/index.ts`:

```ts
export { prisma } from "./client.ts";
export * from "./generated/prisma/client.ts";
export * from "./queue.ts"; // added in Task 6
```

(Leave the `queue.ts` line commented until Task 6 creates the file.) Keep `src/client.ts` as it is in the repo (adapter-pg singleton).

- [ ] **Step 9: Build and commit**

Run: `npm install && npm run build -w @fulfillflow/db && ls libs/db/dist/index.js`
Expected: `dist/index.js` and `dist/generated/prisma/client.js` exist, no type errors.

Write `docs/adr/ADR-07-db-constraints.md` listing each CHECK constraint from Step 6 with one line of rationale (copy the constraint names and expressions verbatim). Then:

```bash
git add -A
git commit -m "feat(db): FulfillFlow V2.1 schema, fresh init migration with invariants, compiled package"
```

---

### Task 3: Synthetic seed (PR-01, part 3)

**Files:**
- Create: `libs/db/prisma/scripts/seed-v2.ts`, `libs/db/src/seed.test.ts`

**Interfaces:**
- Produces: `seedV2(prisma: PrismaClient): Promise<{ organizationId: string; manualStoreId: string; facilityId: string; skuIds: Record<string, string> }>` exported from `prisma/scripts/seed-v2.ts`. Idempotent (upserts on unique keys). Later plans call it in test setup.

- [ ] **Step 1: Write the failing test `src/seed.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./client.ts";
import { seedV2 } from "../prisma/scripts/seed-v2.ts";

test("seedV2 is idempotent and creates the demo tenant", async () => {
  const first = await seedV2(prisma);
  const second = await seedV2(prisma);
  assert.equal(first.organizationId, second.organizationId);
  assert.equal(await prisma.organization.count({ where: { slug: "demo-seller" } }), 1);
  assert.equal(await prisma.store.count({ where: { organizationId: first.organizationId } }), 1);
  assert.equal(await prisma.sku.count(), 6);
  assert.equal(await prisma.bomRevision.count({ where: { status: "ACTIVE" } }), 3);
  const balances = await prisma.inventoryBalance.findMany({ where: { facilityId: first.facilityId } });
  assert.ok(balances.length >= 3);
  for (const b of balances) assert.ok(Number(b.onHand) >= Number(b.reserved));
  await prisma.$disconnect();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @fulfillflow/db`
Expected: FAIL — `Cannot find module '../prisma/scripts/seed-v2.ts'`.

- [ ] **Step 3: Write `prisma/scripts/seed-v2.ts`**

```ts
/**
 * Synthetic demo data. No customer data, no company price lists, no real product names.
 * Idempotent: every write is an upsert on a unique key so re-running is safe.
 * Run: npm run db:seed (from libs/db)   |   import { seedV2 } from tests.
 */
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.ts";

const D = (v: string | number) => new Prisma.Decimal(v);

export async function seedV2(prisma: PrismaClient) {
  const admin = await prisma.user.upsert({
    where: { email: "admin@fulfillflow.local" },
    update: {},
    create: { email: "admin@fulfillflow.local", name: "Platform Admin", platformRole: "ADMIN" },
  });

  const priceList = await prisma.priceList.upsert({
    where: { id: "01900000-0000-7000-8000-000000000001" },
    update: {},
    create: { id: "01900000-0000-7000-8000-000000000001", name: "Standard USD", currency: "USD" },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "demo-seller" },
    update: { priceListId: priceList.id },
    create: { name: "Demo Seller LLC", slug: "demo-seller", priceListId: priceList.id },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo-seller.local" },
    update: {},
    create: { email: "owner@demo-seller.local", name: "Demo Owner" },
  });
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: owner.id } },
    update: {},
    create: { organizationId: org.id, userId: owner.id, role: "OWNER" },
  });

  const manualStore = await prisma.store.upsert({
    where: { provider_externalStoreId: { provider: "MANUAL", externalStoreId: `manual:${org.slug}` } },
    update: {},
    create: { organizationId: org.id, provider: "MANUAL", externalStoreId: `manual:${org.slug}`, name: "Manual / CSV" },
  });

  // Raw materials
  const materials = [
    { code: "MAT-MUG-BLANK-11", name: "Blank mug 11oz", uom: "pcs" },
    { code: "MAT-SHIRT-BLANK", name: "Blank cotton shirt", uom: "pcs" },
    { code: "MAT-WOOD-SHEET", name: "Birch plywood 3mm", uom: "m2" },
    { code: "MAT-BOX-SMALL", name: "Shipping box S", uom: "pcs" },
  ];
  const mat: Record<string, string> = {};
  for (const m of materials) {
    const item = await prisma.inventoryItem.upsert({
      where: { code: m.code },
      update: { name: m.name, uom: m.uom },
      create: { ...m, kind: m.code.startsWith("MAT-BOX") ? "PACKAGING" : "RAW_MATERIAL" },
    });
    mat[m.code] = item.id;
  }

  // Products + SKUs (Sku.id === InventoryItem.id)
  const catalog = [
    { handle: "classic-mug", name: "Classic Mug", skus: [
      { code: "MUG-11-WHT", attrs: { size: "11oz", color: "white" }, mode: "MADE_TO_ORDER", bom: [["MAT-MUG-BLANK-11", "1"], ["MAT-BOX-SMALL", "1"]] },
      { code: "MUG-11-BLK", attrs: { size: "11oz", color: "black" }, mode: "MADE_TO_ORDER", bom: [["MAT-MUG-BLANK-11", "1"], ["MAT-BOX-SMALL", "1"]] },
    ]},
    { handle: "cotton-tee", name: "Cotton Tee", skus: [
      { code: "TEE-M-BLK", attrs: { size: "M", color: "black" }, mode: "MADE_TO_ORDER", bom: [["MAT-SHIRT-BLANK", "1"]] },
      { code: "TEE-L-BLK", attrs: { size: "L", color: "black" }, mode: "MADE_TO_ORDER", bom: [] },
    ]},
    { handle: "wood-ornament", name: "Wood Ornament", skus: [
      { code: "ORN-WOOD-STD", attrs: { size: "std" }, mode: "MADE_TO_ORDER", bom: [] },
      { code: "ORN-WOOD-BLANK", attrs: { size: "std", finish: "raw" }, mode: "FROM_STOCK", bom: [] },
    ]},
  ] as const;

  const skuIds: Record<string, string> = {};
  for (const p of catalog) {
    const product = await prisma.product.upsert({
      where: { handle: p.handle },
      update: { name: p.name, status: "ACTIVE" },
      create: { handle: p.handle, name: p.name, status: "ACTIVE" },
    });
    for (const s of p.skus) {
      const item = await prisma.inventoryItem.upsert({
        where: { code: s.code },
        update: { name: `${p.name} ${Object.values(s.attrs).join(" ")}` },
        create: { code: s.code, name: `${p.name} ${Object.values(s.attrs).join(" ")}`, kind: "FINISHED_GOOD" },
      });
      const sku = await prisma.sku.upsert({
        where: { id: item.id },
        update: { attributes: s.attrs, supplyMode: s.mode, status: "ACTIVE" },
        create: { id: item.id, productId: product.id, attributes: s.attrs, supplyMode: s.mode, status: "ACTIVE" },
      });
      skuIds[s.code] = sku.id;
      await prisma.priceListItem.upsert({
        where: { priceListId_skuId_minQuantity: { priceListId: priceList.id, skuId: sku.id, minQuantity: 1 } },
        update: {},
        create: { priceListId: priceList.id, skuId: sku.id, minQuantity: 1, unitPrice: D("4.5000") },
      });
      if (s.bom.length > 0) {
        const rev = await prisma.bomRevision.upsert({
          where: { skuId_version: { skuId: sku.id, version: 1 } },
          update: {},
          create: { skuId: sku.id, version: 1, status: "ACTIVE", activatedAt: new Date() },
        });
        for (const [code, qty] of s.bom) {
          await prisma.bomComponent.upsert({
            where: { bomRevisionId_inventoryItemId: { bomRevisionId: rev.id, inventoryItemId: mat[code] } },
            update: { quantityPerUnit: D(qty) },
            create: { bomRevisionId: rev.id, inventoryItemId: mat[code], quantityPerUnit: D(qty) },
          });
        }
      }
    }
  }

  const facility = await prisma.facility.upsert({
    where: { code: "HN-01" },
    update: {},
    create: { code: "HN-01", name: "Hanoi Print Facility", countryCode: "VN", timezone: "Asia/Ho_Chi_Minh" },
  });
  await prisma.facilityMembership.upsert({
    where: { facilityId_userId: { facilityId: facility.id, userId: admin.id } },
    update: {},
    create: { facilityId: facility.id, userId: admin.id, role: "MANAGER" },
  });
  for (const skuId of Object.values(skuIds)) {
    await prisma.facilitySkuCapability.upsert({
      where: { facilityId_skuId: { facilityId: facility.id, skuId } },
      update: {},
      create: { facilityId: facility.id, skuId, dailyCapacity: 200, leadTimeHours: 48 },
    });
  }
  for (const [code, onHand] of [["MAT-MUG-BLANK-11", "500"], ["MAT-SHIRT-BLANK", "300"], ["MAT-BOX-SMALL", "1000"], ["MAT-WOOD-SHEET", "25.5"]] as const) {
    await prisma.inventoryBalance.upsert({
      where: { facilityId_inventoryItemId: { facilityId: facility.id, inventoryItemId: mat[code] } },
      update: {},
      create: { facilityId: facility.id, inventoryItemId: mat[code], onHand: D(onHand) },
    });
  }
  await prisma.inventoryBalance.upsert({
    where: { facilityId_inventoryItemId: { facilityId: facility.id, inventoryItemId: skuIds["ORN-WOOD-BLANK"] } },
    update: {},
    create: { facilityId: facility.id, inventoryItemId: skuIds["ORN-WOOD-BLANK"], onHand: D("40") },
  });

  return { organizationId: org.id, manualStoreId: manualStore.id, facilityId: facility.id, skuIds };
}

if (process.argv[1]?.endsWith("seed-v2.ts")) {
  const { prisma } = await import("../../src/client.ts");
  const r = await seedV2(prisma);
  console.log("seeded", r);
  await prisma.$disconnect();
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -w @fulfillflow/db`
Expected: PASS (1 test). Then `npm run db:seed -w @fulfillflow/db` prints `seeded { organizationId: …, skuIds: { MUG-11-WHT: …, … } }`.

- [ ] **Step 5: Commit**

```bash
git add libs/db/prisma/scripts/seed-v2.ts libs/db/src/seed.test.ts
git commit -m "feat(db): idempotent synthetic seed (demo tenant, catalog, BOM, facility, balances)"
```

---

### Task 4: CI — validate, migrate on fresh Postgres, drift check, tests (PR-01, part 4)

**Files:**
- Modify: `.github/workflows/ci.yml` (replace content)

- [ ] **Step 1: Write the workflow**

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_USER: ff, POSTGRES_PASSWORD: ff, POSTGRES_DB: ff }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U ff" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://ff:ff@localhost:5432/ff
      SHADOW_DATABASE_URL: postgresql://ff:ff@localhost:5432/ff_shadow
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: create shadow db
        run: psql "$DATABASE_URL" -c 'CREATE DATABASE ff_shadow;'
      - run: npm run db:validate
      - run: npm run db:migrate:deploy -w @fulfillflow/db
      - name: migration drift check
        run: npm run db:diff -w @fulfillflow/db
      - run: npm run build
      - run: npm test
      - name: legacy name guard
        run: |
          ! git grep -nE "gwprint|BasketPosition|MaterialStock|WarehouseInventory" -- ':!CLAUDE.md' ':!README.md' ':!package-lock.json' ':!docs/**'
```

- [ ] **Step 2: Push the branch and open PR-01**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: postgres service, migrate + drift check, tests, legacy-name guard"
git push -u origin ff/m1-foundation
gh pr create --title "PR-01: FulfillFlow V2.1 schema + fresh migrations + seed" --body "Freezes gwprint v1 on legacy/gwprint-v1. Fresh V2.1 schema (35 models), init migration with CHECK invariants, idempotent synthetic seed, CI with drift check."
```

Expected: CI green. Merge PR-01 before starting Task 5 (Tasks 5–7 branch from the merged `main`).

---

### Task 5: `apps/api` — NestJS skeleton with rawBody, env validation, Prisma module, `/health` (PR-02, part 1)

**Files:**
- Create: `apps/api/package.json`, `apps/api/nest-cli.json`, `apps/api/.swcrc`, `apps/api/tsconfig.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/config/env.ts`, `apps/api/src/prisma/prisma.module.ts`, `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.controller.test.ts`

**Interfaces:**
- Produces: `PrismaService` (injectable, `.client` = the `@fulfillflow/db` singleton), `loadEnv(): Env` with `Env = { NODE_ENV, PORT, DATABASE_URL }`, `AppModule`. M2 adds `ShopifyModule`, `WebhooksModule` here.

- [ ] **Step 1: Package and toolchain files**

`apps/api/package.json`:

```json
{
  "name": "@fulfillflow/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "test": "node --import @swc-node/register/esm-register --test src/**/*.test.ts",
    "lint": "eslint src"
  },
  "dependencies": {
    "@fulfillflow/db": "*",
    "@nestjs/common": "^11.1.0",
    "@nestjs/core": "^11.1.0",
    "@nestjs/platform-express": "^11.1.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.1.0",
    "@swc-node/register": "^1.10.0",
    "@swc/cli": "^0.7.0",
    "@swc/core": "^1.11.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.0",
    "supertest": "^7.0.0"
  }
}
```

`apps/api/nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "sourceRoot": "src",
  "compilerOptions": { "builder": "swc", "typeCheck": true, "deleteOutDir": true }
}
```

`apps/api/.swcrc`:

```json
{
  "$schema": "https://swc.rs/schema.json",
  "sourceMaps": true,
  "module": { "type": "es6" },
  "jsc": {
    "target": "es2022",
    "parser": { "syntax": "typescript", "decorators": true, "dynamicImport": true },
    "transform": { "legacyDecorator": true, "decoratorMetadata": true },
    "baseUrl": "./"
  },
  "minify": false
}
```

`apps/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 2: Write the failing test `src/health/health.controller.test.ts`**

```ts
import "reflect-metadata";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module.js";

let app: INestApplication;

test("GET /health reports db up", async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
  const res = await request(app.getHttpServer()).get("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, db: "up" });
});

after(async () => { await app?.close(); });
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm install && npm test -w @fulfillflow/api`
Expected: FAIL — `Cannot find module '../app.module.js'`.

- [ ] **Step 4: Implement env, Prisma module, health, app module, main**

`src/config/env.ts`:

```ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
});
export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}
```

`src/prisma/prisma.service.ts`:

```ts
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { prisma, type PrismaClient } from "@fulfillflow/db";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = prisma;
  async ping(): Promise<boolean> {
    const rows = await this.client.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
    return rows[0]?.ok === 1;
  }
  async onModuleDestroy() {
    if (process.env.NODE_ENV !== "test") await this.client.$disconnect();
  }
}
```

`src/prisma/prisma.module.ts`:

```ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

`src/health/health.controller.ts`:

```ts
import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    const up = await this.prisma.ping().catch(() => false);
    if (!up) throw new ServiceUnavailableException({ ok: false, db: "down" });
    return { ok: true, db: "up" };
  }
}
```

`src/app.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module.js";
import { HealthController } from "./health/health.controller.js";

@Module({ imports: [PrismaModule], controllers: [HealthController] })
export class AppModule {}
```

`src/main.ts`:

```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
// rawBody: true keeps the exact request bytes on req.rawBody — required for Shopify HMAC verification (M2).
const app = await NestFactory.create(AppModule, { rawBody: true });
app.enableShutdownHooks();
await app.listen(env.PORT);
console.log(JSON.stringify({ msg: "api listening", port: env.PORT, env: env.NODE_ENV }));
```

- [ ] **Step 5: Run the test**

Run: `npm test -w @fulfillflow/api`
Expected: PASS. If it fails with `Cannot use import statement` inside `@fulfillflow/db`, run `npm run build -w @fulfillflow/db` first (Turbo does this in CI via `dependsOn: ["build"]`). If it fails with `Reflect.getMetadata is not a function`, the test file is missing the `import "reflect-metadata"` first line.

- [ ] **Step 6: Build and run the real binary**

Run: `npm run build -w @fulfillflow/api && PORT=3001 node apps/api/dist/main.js & sleep 2 && curl -s localhost:3001/health`
Expected: `{"ok":true,"db":"up"}`. Kill the process afterwards.

- [ ] **Step 7: Commit**

```bash
git checkout -b ff/m1-api-worker main
git add apps/api
git commit -m "feat(api): NestJS skeleton with rawBody, zod env, Prisma module, /health"
```

---

### Task 6: Queue primitives in `libs/db` — `SKIP LOCKED` claim + lease + complete/fail (PR-02, part 2)

**Files:**
- Create: `libs/db/src/queue.ts`, `libs/db/src/queue.test.ts`
- Modify: `libs/db/src/index.ts` (uncomment the `queue.ts` export)

**Interfaces:**
- Produces:
  - `claimOutbox(prisma, { limit, leaseSeconds }): Promise<ClaimedOutbox[]>` where `ClaimedOutbox = { id: string; handler: string; payload: unknown; attempts: number; aggregateType: string; aggregateId: string }`
  - `completeOutbox(prisma, id): Promise<void>` → `status = SENT, processedAt = now()`
  - `failOutbox(prisma, id, { error, maxAttempts }): Promise<"retry" | "dead">` → backoff `min(2^attempts * 30s, 30min)`; `attempts >= maxAttempts` → `DEAD_LETTER`
  - `claimIngestion(prisma, { limit, leaseSeconds }): Promise<{ id: string; topic: string; storeId: string; organizationId: string; attempts: number }[]>` (same lease pattern on `IngestionRecord.lockedUntil`)

- [ ] **Step 1: Write the failing test `src/queue.test.ts`**

```ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./client.ts";
import { claimOutbox, completeOutbox, failOutbox } from "./queue.ts";
import { seedV2 } from "../prisma/scripts/seed-v2.ts";

let organizationId: string;

before(async () => {
  ({ organizationId } = await seedV2(prisma));
  await prisma.outboxEvent.deleteMany({ where: { handler: "test.echo" } });
});
after(async () => { await prisma.$disconnect(); });

async function insert(n: number) {
  await prisma.outboxEvent.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      organizationId, eventKey: `test.echo:${Date.now()}:${i}`, aggregateType: "Test", aggregateId: String(i),
      handler: "test.echo", payload: { i },
    })),
  });
}

test("two concurrent claimers never claim the same row", async () => {
  await insert(10);
  const [a, b] = await Promise.all([
    claimOutbox(prisma, { limit: 10, leaseSeconds: 60 }),
    claimOutbox(prisma, { limit: 10, leaseSeconds: 60 }),
  ]);
  const ids = [...a, ...b].map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicates across claimers");
  assert.equal(ids.length, 10);
  for (const r of [...a, ...b]) await completeOutbox(prisma, r.id);
  assert.equal(await prisma.outboxEvent.count({ where: { handler: "test.echo", status: "PENDING" } }), 0);
});

test("an expired lease makes the row claimable again", async () => {
  await insert(1);
  const [row] = await claimOutbox(prisma, { limit: 1, leaseSeconds: 1 });
  assert.ok(row);
  assert.equal((await claimOutbox(prisma, { limit: 1, leaseSeconds: 1 })).length, 0, "still leased");
  await new Promise((r) => setTimeout(r, 1200));
  const again = await claimOutbox(prisma, { limit: 1, leaseSeconds: 60 });
  assert.equal(again[0]?.id, row.id);
  await completeOutbox(prisma, row.id);
});

test("failOutbox backs off then dead-letters", async () => {
  await insert(1);
  const [row] = await claimOutbox(prisma, { limit: 1, leaseSeconds: 60 });
  assert.equal(await failOutbox(prisma, row.id, { error: "boom", maxAttempts: 2 }), "retry");
  const after1 = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(after1.status, "PENDING");
  assert.ok(after1.availableAt.getTime() > Date.now() + 20_000, "backoff pushed availableAt into the future");
  await prisma.outboxEvent.update({ where: { id: row.id }, data: { availableAt: new Date(0) } });
  const [row2] = await claimOutbox(prisma, { limit: 1, leaseSeconds: 60 });
  assert.equal(row2.id, row.id);
  assert.equal(await failOutbox(prisma, row.id, { error: "boom", maxAttempts: 2 }), "dead");
  const after2 = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(after2.status, "DEAD_LETTER");
  assert.equal(after2.lastError, "boom");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @fulfillflow/db`
Expected: FAIL — `Cannot find module './queue.ts'`.

- [ ] **Step 3: Implement `src/queue.ts`**

```ts
/**
 * Postgres-native job queue primitives. One transaction per claim:
 *   SELECT … FOR UPDATE SKIP LOCKED  →  UPDATE lease  →  RETURNING rows.
 * A crashed worker never leaves a stuck row: the lease (availableAt / lockedUntil)
 * simply expires and the row is claimable again. No PROCESSING status exists.
 */
import { Prisma, type PrismaClient } from "./generated/prisma/client.ts";

export type ClaimOptions = { limit: number; leaseSeconds: number };
export type ClaimedOutbox = {
  id: string; handler: string; payload: unknown; attempts: number; aggregateType: string; aggregateId: string;
};
export type ClaimedIngestion = { id: string; topic: string; storeId: string; organizationId: string; attempts: number };

export async function claimOutbox(prisma: PrismaClient, { limit, leaseSeconds }: ClaimOptions): Promise<ClaimedOutbox[]> {
  return prisma.$queryRaw<ClaimedOutbox[]>`
    WITH picked AS (
      SELECT id FROM "OutboxEvent"
      WHERE status = 'PENDING' AND "availableAt" <= now()
      ORDER BY "availableAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "OutboxEvent" o
    SET "availableAt" = now() + make_interval(secs => ${leaseSeconds}), attempts = attempts + 1
    FROM picked WHERE o.id = picked.id
    RETURNING o.id, o.handler, o.payload, o.attempts, o."aggregateType", o."aggregateId"`;
}

export async function completeOutbox(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.outboxEvent.update({ where: { id }, data: { status: "SENT", processedAt: new Date() } });
}

export function backoffSeconds(attempts: number): number {
  return Math.min(2 ** attempts * 30, 30 * 60);
}

export async function failOutbox(
  prisma: PrismaClient, id: string, { error, maxAttempts }: { error: string; maxAttempts: number },
): Promise<"retry" | "dead"> {
  const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id }, select: { attempts: true } });
  const message = error.slice(0, 2000);
  if (row.attempts >= maxAttempts) {
    await prisma.outboxEvent.update({ where: { id }, data: { status: "DEAD_LETTER", lastError: message } });
    return "dead";
  }
  await prisma.outboxEvent.update({
    where: { id },
    data: { lastError: message, availableAt: new Date(Date.now() + backoffSeconds(row.attempts) * 1000) },
  });
  return "retry";
}

export async function claimIngestion(prisma: PrismaClient, { limit, leaseSeconds }: ClaimOptions): Promise<ClaimedIngestion[]> {
  return prisma.$queryRaw<ClaimedIngestion[]>`
    WITH picked AS (
      SELECT id FROM "IngestionRecord"
      WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
        AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
      ORDER BY "nextAttemptAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "IngestionRecord" r
    SET "lockedUntil" = now() + make_interval(secs => ${leaseSeconds}), attempts = attempts + 1
    FROM picked WHERE r.id = picked.id
    RETURNING r.id, r.topic, r."storeId", r."organizationId", r.attempts`;
}

export { Prisma };
```

- [ ] **Step 4: Export and run the tests**

Uncomment `export * from "./queue.ts";` in `src/index.ts`. Run: `npm run build -w @fulfillflow/db && npm test -w @fulfillflow/db`
Expected: PASS (seed test + 3 queue tests). The lease test takes ~1.5 s by design.

- [ ] **Step 5: Commit**

```bash
git add libs/db/src/queue.ts libs/db/src/queue.test.ts libs/db/src/index.ts
git commit -m "feat(db): SKIP LOCKED + lease queue primitives for outbox and ingestion"
```

---

### Task 7: `apps/worker` — handler registry, outbox loop, graceful shutdown, deploy wiring (PR-02, part 3)

**Files:**
- Create: `apps/worker/package.json`, `apps/worker/nest-cli.json`, `apps/worker/.swcrc`, `apps/worker/tsconfig.json` (copies of the api files with the name changed), `apps/worker/src/main.ts`, `apps/worker/src/worker.module.ts`, `apps/worker/src/queue/handler-registry.ts`, `apps/worker/src/queue/outbox-loop.ts`, `apps/worker/src/queue/outbox-loop.test.ts`, `apps/worker/src/handlers/noop-echo.handler.ts`, `apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/api/railway.json`, `apps/worker/railway.json`

**Interfaces:**
- Produces: `OutboxHandler = (event: ClaimedOutbox) => Promise<void>`; `HandlerRegistry.register(name, handler)`, `.get(name)`; `OutboxLoop.tick(): Promise<number>` (rows processed) and `.run(signal: AbortSignal)`. M2 registers `shopify.fulfillment.create` and `shopify.token.refresh` here; ingestion loop follows the same shape in M2.

- [ ] **Step 1: Copy toolchain files from `apps/api`**

Copy `nest-cli.json`, `.swcrc`, `tsconfig.json` unchanged. `apps/worker/package.json` is the api one with `"name": "@fulfillflow/worker"`, without `@nestjs/platform-express`, `supertest`, `@types/supertest`, `@types/express`.

- [ ] **Step 2: Write the failing test `src/queue/outbox-loop.test.ts`**

```ts
import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { HandlerRegistry } from "./handler-registry.js";
import { OutboxLoop } from "./outbox-loop.js";

before(async () => { await prisma.outboxEvent.deleteMany({ where: { handler: { startsWith: "test." } } }); });
after(async () => { await prisma.$disconnect(); });

test("tick dispatches to the registered handler and marks SENT; unknown handler dead-letters", async () => {
  const seen: unknown[] = [];
  const registry = new HandlerRegistry();
  registry.register("test.echo", async (e) => { seen.push(e.payload); });
  await prisma.outboxEvent.createMany({ data: [
    { eventKey: `test.echo:${Date.now()}`, aggregateType: "T", aggregateId: "1", handler: "test.echo", payload: { hi: 1 } },
    { eventKey: `test.unknown:${Date.now()}`, aggregateType: "T", aggregateId: "2", handler: "test.unknown", payload: {} },
  ]});
  const loop = new OutboxLoop(prisma, registry, { batchSize: 10, leaseSeconds: 30, maxAttempts: 1, pollMs: 10 });
  const processed = await loop.tick();
  assert.equal(processed, 2);
  assert.deepEqual(seen, [{ hi: 1 }]);
  const rows = await prisma.outboxEvent.findMany({ where: { handler: { startsWith: "test." } }, orderBy: { handler: "asc" } });
  assert.equal(rows[0].status, "SENT");
  assert.equal(rows[1].status, "DEAD_LETTER");
  assert.match(rows[1].lastError ?? "", /no handler registered/);
});

test("run() stops on abort", async () => {
  const loop = new OutboxLoop(prisma, new HandlerRegistry(), { batchSize: 1, leaseSeconds: 30, maxAttempts: 1, pollMs: 10 });
  const ac = new AbortController();
  const done = loop.run(ac.signal);
  setTimeout(() => ac.abort(), 50);
  await done; // resolves instead of hanging
  assert.ok(true);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm install && npm test -w @fulfillflow/worker`
Expected: FAIL — `Cannot find module './handler-registry.js'`.

- [ ] **Step 4: Implement registry, loop, noop handler, module, main**

`src/queue/handler-registry.ts`:

```ts
import type { ClaimedOutbox } from "@fulfillflow/db";

export type OutboxHandler = (event: ClaimedOutbox) => Promise<void>;

export class HandlerRegistry {
  private readonly handlers = new Map<string, OutboxHandler>();
  register(name: string, handler: OutboxHandler): this {
    if (this.handlers.has(name)) throw new Error(`handler already registered: ${name}`);
    this.handlers.set(name, handler);
    return this;
  }
  get(name: string): OutboxHandler | undefined { return this.handlers.get(name); }
}
```

`src/queue/outbox-loop.ts`:

```ts
import { claimOutbox, completeOutbox, failOutbox, type PrismaClient } from "@fulfillflow/db";
import type { HandlerRegistry } from "./handler-registry.js";

export type LoopOptions = { batchSize: number; leaseSeconds: number; maxAttempts: number; pollMs: number };

export class OutboxLoop {
  constructor(private readonly prisma: PrismaClient, private readonly registry: HandlerRegistry, private readonly opts: LoopOptions) {}

  /** Claims one batch, runs handlers, settles each row. Returns rows processed. */
  async tick(): Promise<number> {
    const batch = await claimOutbox(this.prisma, { limit: this.opts.batchSize, leaseSeconds: this.opts.leaseSeconds });
    for (const event of batch) {
      const handler = this.registry.get(event.handler);
      if (!handler) {
        await failOutbox(this.prisma, event.id, { error: `no handler registered: ${event.handler}`, maxAttempts: 0 });
        continue;
      }
      try {
        await handler(event);
        await completeOutbox(this.prisma, event.id);
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        await failOutbox(this.prisma, event.id, { error: message, maxAttempts: this.opts.maxAttempts });
      }
    }
    return batch.length;
  }

  /** Polls until the signal aborts. Sleeps pollMs only when a tick found nothing. */
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let n = 0;
      try { n = await this.tick(); } catch (err) { console.error(JSON.stringify({ msg: "outbox tick failed", err: String(err) })); }
      if (n === 0) await new Promise<void>((r) => { const t = setTimeout(r, this.opts.pollMs); signal.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true }); });
    }
  }
}
```

`src/handlers/noop-echo.handler.ts`:

```ts
import type { OutboxHandler } from "../queue/handler-registry.js";
/** Dev/demo handler: logs the payload. Proves the loop end-to-end before real integrations exist. */
export const noopEchoHandler: OutboxHandler = async (event) => {
  console.log(JSON.stringify({ msg: "noop.echo", id: event.id, aggregate: `${event.aggregateType}:${event.aggregateId}`, payload: event.payload }));
};
```

`src/worker.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { prisma } from "@fulfillflow/db";
import { HandlerRegistry } from "./queue/handler-registry.js";
import { OutboxLoop } from "./queue/outbox-loop.js";
import { noopEchoHandler } from "./handlers/noop-echo.handler.js";

export const OUTBOX_LOOP = Symbol("OUTBOX_LOOP");

@Module({
  providers: [
    { provide: HandlerRegistry, useFactory: () => new HandlerRegistry().register("noop.echo", noopEchoHandler) },
    {
      provide: OUTBOX_LOOP,
      inject: [HandlerRegistry],
      useFactory: (registry: HandlerRegistry) =>
        new OutboxLoop(prisma, registry, { batchSize: 20, leaseSeconds: 60, maxAttempts: 8, pollMs: 1000 }),
    },
  ],
  exports: [OUTBOX_LOOP],
})
export class WorkerModule {}
```

`src/main.ts`:

```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { prisma } from "@fulfillflow/db";
import { WorkerModule, OUTBOX_LOOP } from "./worker.module.js";
import type { OutboxLoop } from "./queue/outbox-loop.js";

const ctx = await NestFactory.createApplicationContext(WorkerModule, { logger: ["error", "warn", "log"] });
const loop = ctx.get<OutboxLoop>(OUTBOX_LOOP);
const ac = new AbortController();
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { console.log(JSON.stringify({ msg: "worker stopping", sig })); ac.abort(); });
console.log(JSON.stringify({ msg: "worker started" }));
await loop.run(ac.signal);
await ctx.close();
await prisma.$disconnect();
console.log(JSON.stringify({ msg: "worker stopped" }));
```

- [ ] **Step 5: Run the tests**

Run: `npm test -w @fulfillflow/worker`
Expected: PASS (2 tests).

- [ ] **Step 6: Deploy wiring**

`apps/api/Dockerfile` (worker identical with `apps/worker` and `dist/main.js`):

```dockerfile
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY libs/db/package.json libs/db/
COPY libs/shared/package.json libs/shared/
RUN npm ci --ignore-scripts
COPY . .
RUN npm run db:generate -w @fulfillflow/db && npx turbo run build --filter=@fulfillflow/api

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo /repo
CMD ["node", "apps/api/dist/main.js"]
```

`apps/api/railway.json` (worker: same without `healthcheckPath`):

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "apps/api/Dockerfile" },
  "deploy": { "healthcheckPath": "/health", "healthcheckTimeout": 120, "restartPolicyType": "ON_FAILURE", "restartPolicyMaxRetries": 3 }
}
```

In Railway create two services from the same repo; set each service's "Config file path" to `apps/api/railway.json` / `apps/worker/railway.json`; add a Postgres plugin and reference its `DATABASE_URL` in both. Run migrations as a pre-deploy command on the api service: `npm run db:migrate:deploy -w @fulfillflow/db`.

- [ ] **Step 7: Full local verification**

```bash
npm run build && npm test
scripts/db-fresh-local.sh
(PORT=3001 node apps/api/dist/main.js &) ; (node apps/worker/dist/main.js &) ; sleep 2
curl -s localhost:3001/health
node --experimental-strip-types -e "import('@fulfillflow/db').then(async ({prisma}) => { await prisma.outboxEvent.create({ data: { eventKey: 'demo:'+Date.now(), aggregateType: 'Demo', aggregateId: '1', handler: 'noop.echo', payload: { hello: 'world' } } }); await prisma.\$disconnect(); })"
sleep 2; kill %1 %2
```

Expected: health `{"ok":true,"db":"up"}`; worker log line `{"msg":"noop.echo",…,"payload":{"hello":"world"}}` within ~1 s; worker prints `worker stopping` then `worker stopped` on kill (graceful).

- [ ] **Step 8: Commit and open PR-02**

```bash
git add apps/worker apps/api/Dockerfile apps/api/railway.json
git commit -m "feat(worker): outbox loop with handler registry, lease/backoff, graceful shutdown; Railway wiring"
git push -u origin ff/m1-api-worker
gh pr create --title "PR-02: NestJS api + worker foundation (SKIP LOCKED queue)" --body "api: rawBody, zod env, Prisma module, /health. worker: outbox loop (claim → dispatch → complete/fail with backoff + dead-letter), graceful shutdown. Two Railway services."
```

---

## Self-review

**Spec coverage (M1 scope only):** schema V2.1 + partial indexes + CHECK invariants → Task 2; fresh migration history + drift CI → Tasks 2, 4; synthetic seed → Task 3; api with `rawBody: true` (spec §3.2) → Task 5; worker lease pattern (spec §3.3, §9 of review) → Tasks 6–7; three-process topology and Railway → Task 7. Deliberately deferred to M2: `ShopifySessionGuard`, `ShopifyTokenManager`, webhook endpoint, ingestion handlers, `ShopifyFulfillmentOrderLine` usage (table exists), compliance topics, embedded UI. `ApiIdempotencyKey` table exists; middleware is M3.

**Placeholders:** none — every step has the file content or the exact command. The only conditional instruction is the `.ts`/`.js` import-extension check in Task 2 Step 8, resolved by inspecting one generated file.

**Type consistency:** `ClaimedOutbox` is defined in `libs/db/src/queue.ts` (Task 6) and consumed by `HandlerRegistry`/`OutboxLoop` (Task 7) with the same fields; `failOutbox` returns `"retry" | "dead"` in both the implementation and the tests; `seedV2` returns `{ organizationId, manualStoreId, facilityId, skuIds }` and `queue.test.ts` destructures `organizationId` only.

**Known risk to check first at execution:** NestJS 11 + ESM + SWC on Node 22 (Task 5 Step 5). If `nest build` emits CommonJS despite `.swcrc` `module.type = "es6"`, add `"type": "module"`-aware `tsconfig` `module: "NodeNext"` (already set) and run `nest build` with `--builder swc --type-check`; if `@nestjs/testing` cannot import the ESM `AppModule`, the fallback is to switch `apps/api`/`apps/worker` to CommonJS (`module: "commonjs"`, drop `.js` extensions) and consume `@fulfillflow/db` through a CJS build (`tsconfig.build.json` `module: "commonjs"`, `main: dist/index.cjs`). Either fallback is a 30-minute change contained in the toolchain files; the source files in this plan do not change.
