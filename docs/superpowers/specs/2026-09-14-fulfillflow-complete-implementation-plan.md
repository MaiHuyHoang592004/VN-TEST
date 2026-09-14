# FulfillFlow — Complete Product Implementation Plan (M2 → M8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Use TDD, review after every task, and do not skip a gate because later tasks depend on it.

**Goal:** Starting from the completed M1 branch (`ff/m1-foundation`), finish FulfillFlow as a deployable Shopify embedded app and fulfillment automation platform: Shopify install/auth → durable order ingestion → merchant exception workflow → routing/inventory/fulfillment → shipment → Shopify fulfillment/tracking sync-back → reliability/compliance → product metrics/policies → deployment/demo/portfolio package.

**Architecture:** Keep the M1 modular monolith: NestJS API + NestJS worker + Prisma/PostgreSQL. `apps/shopify-web` is the merchant UI only; all fulfillment business logic stays in core services. Shopify webhooks only verify + durably insert `IngestionRecord`; workers normalize/process asynchronously. External side effects use the transactional outbox. Shopify fulfillment sync resolves `FulfillmentOrder` lazily and calls GraphQL only from the worker.

**Tech Stack:** Node 22, TypeScript 6, npm workspaces, Turbo 2, Prisma 7.8+, PostgreSQL 17, NestJS 11 + SWC, React 19 + Vite, Shopify App Bridge CDN, Polaris web components, Shopify GraphQL Admin API `2026-07`, `node:test`, real-Postgres integration tests, fake Shopify HTTP stub, GitHub Actions, Railway.

**Specs:**
- `docs/superpowers/specs/2026-09-11-shopify-connect-design.md` (copy the approved Shopify Connect design into the repo if it is not already there)
- `docs/adr/ADR-07-db-constraints.md`
- canonical V2.1 schema under `libs/db/prisma/schema/`
- M1 state: `ff/m1-foundation`, CI green, PR #3 open, do not merge into `main` until the new FulfillFlow deployment is ready.

## Global Constraints

- `legacy/gwprint-v1` and tag `v1-legacy` are archival only. Never merge legacy code back.
- Keep GWPrintz Railway project and its current Postgres untouched until M8 cutover.
- Create/use a separate Shopify dev store and later a separate Railway FulfillFlow project/database.
- Never commit Shopify secrets, access tokens, refresh tokens, `TOKEN_ENC_KEY`, Railway credentials, or dev-store PII.
- Shopify merchant routes derive `organizationId`/`storeId` from verified `TenantContext`; never accept tenant ids from request body/query.
- Shopify webhook endpoint performs: raw-body HMAC verify → resolve store → durable `IngestionRecord` insert/dedupe → commit → 200. No business processing in request path.
- Read token lifetimes from Shopify token responses; never hard-code access/refresh expiry.
- One OutboxEvent row equals one side effect. Never put access tokens in outbox payloads.
- Use fresh migrations only. No `prisma db push` or `prisma migrate reset` against shared/Railway DBs.
- Real Postgres for DB tests. Test tasks remain serialized when sharing one test DB.
- All user-visible/synthetic demo data must be synthetic. No company/customer/order data from the old system.
- V1 stays an **order-management app using merchant-managed FulfillmentOrders**. Do not implement FulfillmentService registration, returns, Billing API, Shopify Flow, inventory sync-to-Shopify, or multi-currency presentment in this plan.
- Do not merge to `main` until M8 Gate 8 passes.

---

# Execution topology and branches

Create a non-deployed integration branch so M2–M8 can be reviewed without touching GWPrintz production:

```bash
git fetch origin
git checkout ff/m1-foundation
git pull --ff-only origin ff/m1-foundation
git checkout -b fulfillflow-v2
git push -u origin fulfillflow-v2
```

For each milestone use a short-lived branch from `fulfillflow-v2`, PR back into `fulfillflow-v2`, merge only after that milestone's gate is green:

```text
ff/m2-shopify-auth-webhooks
ff/m3-order-ingestion-merchant-ui
ff/m4-fulfillment-engine
ff/m5-shopify-sync-back
ff/m6-reliability-compliance
ff/m7-product-polish
ff/m8-deploy-portfolio
```

Final cutover in M8: repoint/create FulfillFlow Railway services first, verify production-like E2E, then merge `fulfillflow-v2` to `main`.

---

# Human Setup Gate H0 — Shopify development environment

Claude cannot safely invent or commit external credentials. Before Task 1, require the human to create these once in Shopify Dev Dashboard:

1. Create an unpublished **public app** named `FulfillFlow Connect`.
2. Create a development store such as `fulfillflow-dev.myshopify.com` with demo products/orders or create test products manually.
3. Configure protected customer data fields actually needed by fulfillment: customer name, email/phone if used, and shipping address.
4. Keep app distribution unpublished; install only on the dev store.
5. Provide local environment values outside git:

```bash
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
TOKEN_ENC_KEY=...        # 32-byte secret encoded consistently by the implementation
SHOPIFY_DEV_STORE=fulfillflow-dev.myshopify.com
DATABASE_URL=postgresql://...
APP_URL=https://...      # Shopify CLI tunnel while local; Railway URL in M8
```

**Gate H0:** Claude can run `shopify app dev`, the dev store is accessible, and no secrets appear in `git status`, `git diff`, or committed files.

---

# M2 — Shopify shell, managed installation, auth/token lifecycle, durable webhooks

## Task 1: Pin Shopify app configuration and verify the 2026 auth contract

**Files:**
- Create: `shopify.app.toml`
- Create: `shopify.web.toml`
- Create: `docs/adr/ADR-01-shopify-order-management-app.md`
- Create: `docs/adr/ADR-02-expiring-offline-token.md`
- Modify: root `.gitignore`

**Interfaces:**
- Produces pinned API version `2026-07`, managed-install scopes, and the exact auth contract used by later code.

- [ ] **Step 1: verify current Shopify docs before coding.** Confirm these facts against `shopify.dev`: managed installation + token exchange for embedded apps; ID-token claims (`exp`, `nbf`, `aud`, `iss`, `dest`, `sub`); expiring offline token exchange with `expiring=1`; refresh-token rotation; GraphQL Admin API endpoint; merchant-managed fulfillment scopes.
- [ ] **Step 2: write `shopify.app.toml`.** Use `embedded = true`, API version `2026-07`, and scopes:

```toml
[access_scopes]
scopes = "read_orders,read_products,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders"
```

Register subscriptions for:

```text
orders/create
orders/updated
orders/cancelled
fulfillment_orders/order_routing_complete
app/uninstalled
customers/data_request
customers/redact
shop/redact
```

All webhooks target `/webhooks/shopify`.
- [ ] **Step 3: document ADR-01.** State: order-management app, merchant-managed FulfillmentOrders, not a fulfillment-service app.
- [ ] **Step 4: document ADR-02.** State: offline access token, refresh token, optimistic token rotation, no OAuth redirect flow, no token in logs/outbox.
- [ ] **Step 5: run config validation:** `shopify app config link` if needed, then `shopify app deploy --no-release` or the current CLI validation-only equivalent. Do not deploy scopes to a non-dev merchant store.
- [ ] **Step 6: commit.**

```bash
git add shopify.app.toml shopify.web.toml docs/adr .gitignore
git commit -m "chore(shopify): pin embedded app config and auth decisions"
```

---

## Task 2: Add the embedded React/Vite shell and serve it same-origin

**Files:**
- Create: `apps/shopify-web/package.json`
- Create: `apps/shopify-web/index.html`
- Create: `apps/shopify-web/vite.config.ts`
- Create: `apps/shopify-web/tsconfig.json`
- Create: `apps/shopify-web/src/main.tsx`
- Create: `apps/shopify-web/src/app.tsx`
- Create: `apps/shopify-web/src/lib/api.ts`
- Create: `apps/shopify-web/src/styles.css`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/Dockerfile`
- Modify: root `turbo.json`

**Interfaces:**
- Produces `apps/shopify-web/dist/` and a same-origin app home served by NestJS.
- `apiFetch(path, init)` is the single merchant-API client.

- [ ] **Step 1: add a failing build check.** Add a root CI step that requires `npm run build -w @fulfillflow/shopify-web`; run it and confirm failure because the workspace does not exist.
- [ ] **Step 2: scaffold React + Vite only.** Load Shopify App Bridge and Polaris web components from Shopify CDN script tags in `index.html`; do not install `@shopify/polaris`.
- [ ] **Step 3: implement `App` with only two nav targets:** `/` (Orders placeholder) and `/sku-mappings` (SKU Mapping placeholder). Use Polaris web components (`<s-page>`, `<s-button>`, etc.).
- [ ] **Step 4: implement `apiFetch`.** For standard same-origin fetch use App Bridge interception. If local CLI topology makes the API cross-origin, explicitly call `shopify.idToken()` and add `Authorization: Bearer <token>`; keep that behavior isolated inside `apiFetch`.
- [ ] **Step 5: serve the Vite build from NestJS in production.** Add `@nestjs/serve-static`; serve `apps/shopify-web/dist` at app root while preserving `/health`, `/app/**`, `/webhooks/**` API routes.
- [ ] **Step 6: verify:** `npm run build`, start API, request `/` and assert HTTP 200 plus the built app shell.
- [ ] **Step 7: commit.**

```bash
git add apps/shopify-web apps/api package-lock.json turbo.json
git commit -m "feat(shopify-web): embedded React shell served by NestJS"
```

---

## Task 3: Extend token persistence and implement crypto

**Files:**
- Modify: `libs/db/prisma/schema/models/store.prisma`
- Create migration: `libs/db/prisma/migrations/<timestamp>_shopify_refresh_token_expiry/migration.sql`
- Create: `apps/api/src/shopify/crypto/token-crypto.service.ts`
- Create: `apps/api/src/shopify/crypto/token-crypto.service.test.ts`
- Modify: `apps/api/src/config/env.ts`

**Interfaces:**
- Adds `Store.refreshTokenExpiresAt DateTime? @db.Timestamptz(3)`.
- Produces `TokenCryptoService.encrypt(plaintext): Buffer` and `decrypt(ciphertext): string`.

- [ ] **Step 1: write failing crypto tests.** Round-trip succeeds; same plaintext produces different ciphertext because of random IV; tampering fails authentication.
- [ ] **Step 2: add `refreshTokenExpiresAt` to Store and generate a normal Prisma migration.** Do not edit the M1 init migration.
- [ ] **Step 3: implement AES-256-GCM.** Prefix ciphertext with a one-byte format version + 12-byte IV + 16-byte auth tag + encrypted bytes. Validate decoded key length is exactly 32 bytes during env startup.
- [ ] **Step 4: run `db:validate`, migration on fresh test DB, db tests, API tests.**
- [ ] **Step 5: commit.**

```bash
git add libs/db apps/api/src/shopify apps/api/src/config
git commit -m "feat(shopify): encrypted expiring token persistence"
```

---

## Task 4: ID-token verification, TenantContext, bootstrap

**Files:**
- Create: `apps/api/src/shopify/auth/shopify-id-token.ts`
- Create: `apps/api/src/shopify/auth/shopify-session.guard.ts`
- Create: `apps/api/src/shopify/auth/tenant-context.ts`
- Create: `apps/api/src/shopify/auth/current-tenant.decorator.ts`
- Create: `apps/api/src/shopify/auth/session.controller.ts`
- Create: `apps/api/src/shopify/auth/session.service.ts`
- Create tests beside each service/controller
- Create: `apps/api/src/shopify/shopify.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

```ts
export type TenantContext = {
  organizationId: string;
  storeId: string;
  userId: string;
  shopDomain: string;
};

POST /app/session/bootstrap
GET  /app/session
```

- [ ] **Step 1: failing JWT tests:** expired → 401; `nbf` future → 401; wrong `aud` → 401; mismatched `iss`/`dest` host → 401; valid token → claims returned.
- [ ] **Step 2: implement verification with an ESM-friendly JWT library.** Verify HS256 signature with `SHOPIFY_API_SECRET`; normalize and validate `*.myshopify.com` domain.
- [ ] **Step 3: failing bootstrap integration test:** valid token for an unknown shop creates exactly one `Organization`, one `Store(provider=SHOPIFY)`, one `User(shopifyUserId=sub)`, one OWNER membership; running twice is idempotent.
- [ ] **Step 4: implement bootstrap transaction.** Slug is derived deterministically from shop domain with collision-safe suffix only if needed.
- [ ] **Step 5: implement `ShopifySessionGuard`.** Only `/app/session/bootstrap` may bootstrap an unknown store; all other `/app/**` routes return 401 if store is missing/disconnected.
- [ ] **Step 6: verify tenant spoofing:** send body/query with another organization id and assert it is ignored or rejected; repository inputs use only `TenantContext`.
- [ ] **Step 7: commit.**

```bash
git add apps/api/src/shopify apps/api/src/app.module.ts
git commit -m "feat(shopify): verified embedded session and tenant bootstrap"
```

---

## Task 5: Token exchange, refresh, optimistic rotation

**Files:**
- Create: `apps/api/src/shopify/client/shopify-auth.client.ts`
- Create: `apps/api/src/shopify/client/shopify-graphql.client.ts`
- Create: `apps/api/src/shopify/token/shopify-token-manager.service.ts`
- Create tests for auth client + token manager
- Modify: `apps/api/src/shopify/auth/session.service.ts`

**Interfaces:**

```ts
withAccessToken<T>(storeId: string, fn: (accessToken: string) => Promise<T>): Promise<T>
exchangeIdToken(shopDomain: string, idToken: string): Promise<TokenResponse>
refresh(shopDomain: string, refreshToken: string): Promise<TokenResponse>
```

`TokenResponse` must preserve `access_token`, `refresh_token`, `scope`, `expires_in`, and refresh-token expiry returned by Shopify.

- [ ] **Step 1: fake Shopify HTTP tests for token exchange.** Assert exact `application/x-www-form-urlencoded` request, token endpoint shop domain, `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, ID-token subject fields, client id/secret, and `expiring=1`.
- [ ] **Step 2: fake refresh tests.** Assert the current official refresh grant fields; never reuse an old refresh token after a successful rotation.
- [ ] **Step 3: token-manager test:** expiry <5m causes refresh before API call; fresh token does not refresh; one 401 triggers one refresh + one retry; second 401 surfaces error.
- [ ] **Step 4: concurrency integration test:** two refreshers on same `tokenVersion` → exactly one optimistic update wins; loser rereads and uses winner's token.
- [ ] **Step 5: invalid refresh test:** mark Store `ERROR`, create one merchant-visible `CHANNEL_SYNC_FAILED` store exception, clear unusable credentials, require app reopen/bootstrap.
- [ ] **Step 6: bootstrap now performs initial token exchange and stores encrypted rotated credentials + granted scopes + both expiries.
- [ ] **Step 7: commit.**

```bash
git add apps/api/src/shopify
git commit -m "feat(shopify): token exchange refresh and concurrency-safe rotation"
```

---

## Task 6: Durable webhook endpoint

**Files:**
- Create: `apps/api/src/shopify/webhooks/shopify-webhook.controller.ts`
- Create: `apps/api/src/shopify/webhooks/shopify-webhook.service.ts`
- Create tests with Supertest + real Postgres
- Modify: `apps/api/src/shopify/shopify.module.ts`

**Interfaces:**

```text
POST /webhooks/shopify
```

- [ ] **Step 1: failing HMAC tests:** correct raw body → accepted; wrong HMAC → 401 and zero rows; parsed/modified body produces a different HMAC and fails.
- [ ] **Step 2: implement constant-time HMAC SHA-256 base64 verification using `req.rawBody` only.
- [ ] **Step 3: integration test duplicate `X-Shopify-Webhook-Id` delivered 3 times → exactly one `IngestionRecord`.
- [ ] **Step 4: integration test DB insert failure → HTTP 500; valid insert commit → 200.
- [ ] **Step 5: unknown/disconnected store behavior:** normal topic → 200 ignore; compliance topics remain processable if store record exists.
- [ ] **Step 6: assert endpoint does not create/update Order and does not call Shopify.
- [ ] **Step 7: commit.**

```bash
git add apps/api/src/shopify/webhooks
git commit -m "feat(shopify): durable HMAC-verified webhook intake"
```

### Gate M2

Run:

```bash
npm run build
npm test
shopify app dev
```

Manual dev-store check: open embedded app → bootstrap Store; create one Shopify test order → exactly one PENDING `IngestionRecord`; duplicate webhook delivery remains one row. **Do not continue if token exchange or webhook durability is not proven.**

---

# M3 — Shopify order ingestion, exceptions, SKU mapping, merchant UI

## Task 7: Add the ingestion worker loop and handler registry

**Files:**
- Create: `apps/worker/src/ingestion/ingestion-handler-registry.ts`
- Create: `apps/worker/src/ingestion/ingestion-loop.ts`
- Create tests
- Modify: `apps/worker/src/worker.module.ts`
- Modify: `apps/worker/src/main.ts`

**Interfaces:**

```ts
type IngestionHandler = (record: ClaimedIngestion) => Promise<void>;
registry.register(topic: string, handler: IngestionHandler): void;
IngestionLoop.tick(): Promise<number>;
```

- [ ] **Step 1: failing dispatch test:** `orders/create` record reaches registered handler and record becomes ACCEPTED only when handler succeeds.
- [ ] **Step 2: transient failure test:** handler throws `RetryableIngestionError` → record returns PENDING with backoff and cleared/expired lease.
- [ ] **Step 3: business failure test:** handler throws typed `BusinessIngestionError` → record EXCEPTION + errorCode/errorMessage.
- [ ] **Step 4: implement loop using existing `claimIngestion` primitive; add graceful AbortSignal shutdown.
- [ ] **Step 5: commit.**

```bash
git add apps/worker/src/ingestion apps/worker/src/main.ts apps/worker/src/worker.module.ts
git commit -m "feat(worker): durable ingestion loop and topic registry"
```

---

## Task 8: Normalize and create Shopify orders

**Files:**
- Modify: `libs/db/prisma/schema/models/order-address.prisma`
- Create migration: `libs/db/prisma/migrations/<timestamp>_shopify_nullable_address/migration.sql`
- Create: `apps/worker/src/channels/shopify/orders/shopify-order.schema.ts`
- Create: `apps/worker/src/channels/shopify/orders/shopify-order-normalizer.ts`
- Create: `apps/worker/src/channels/shopify/orders/address-completeness.validator.ts`
- Create: `apps/worker/src/channels/shopify/orders/orders-create.handler.ts`
- Create fixtures: `apps/worker/test/fixtures/shopify/order-paid-mapped.json`, `order-paid-unmapped.json`, `order-unpaid.json`, `order-invalid-address.json`, `order-two-lines.json`
- Create unit + integration tests

**Interfaces:**

```ts
normalizeShopifyOrder(raw: unknown): NormalizedShopifyOrder
processOrdersCreate(recordId: string): Promise<void>
```

- [ ] **Step 1: make address storage tolerant of incomplete channel data.** Change `OrderAddress.name`, `line1`, `city`, `postalCode`, and `countryCode` to nullable and add `validationErrors Json?`; generate/apply a normal migration. This preserves the product rule “create the order, block shipping” instead of rejecting the whole webhook when the address is incomplete.
- [ ] **Step 2: fixture tests for mapping:** GraphQL order gid → `externalId`; name → `displayNumber`; created/updated timestamps; financial status; currency; address; line ids; properties/customization.
- [ ] **Step 3: implement completeness validation.** Required for V1 auto-validation: `name`, `line1`, `city`, `postalCode`, 2-letter `countryCode`. Complete → `VALID`; missing/invalid → `INVALID` + machine-readable `validationErrors`. This is syntactic completeness only, not carrier deliverability validation.
- [ ] **Step 4: mapped paid order integration test:** creates one Order and N OrderItems atomically, sets `resultOrderId`, marks ingestion ACCEPTED.
- [ ] **Step 5: invalid-address test:** still creates Order + OrderItems, sets address INVALID and creates one merchant-visible `INVALID_ADDRESS`; routing may continue later but shipping is blocked until correction.
- [ ] **Step 6: unknown SKU test:** one unmapped line means **no Order at all**, IngestionRecord EXCEPTION, one merchant-visible `SKU_NOT_MAPPED` keyed to `ingestion:<id>`.
- [ ] **Step 7: unpaid test:** no Order, record HELD.
- [ ] **Step 8: duplicate entity test:** a new webhook delivery for the same Shopify order cannot create a second Order because of `sourceKey`/`storeId+externalId` uniqueness; mark duplicate/no-op deterministically.
- [ ] **Step 9: commit.**

```bash
git add apps/worker/src/channels/shopify/orders apps/worker/test/fixtures
git commit -m "feat(ingestion): normalize Shopify orders into canonical domain"
```

---

## Task 9: Handle `orders/updated` and `orders/cancelled`

**Files:**
- Create: `apps/worker/src/channels/shopify/orders/orders-updated.handler.ts`
- Create: `apps/worker/src/channels/shopify/orders/orders-cancelled.handler.ts`
- Create tests

**Interfaces:** same ingestion registry topics.

- [ ] **Step 1: stale update test:** incoming `updated_at <= channelUpdatedAt` changes nothing.
- [ ] **Step 2: HELD recovery test:** unpaid create HELD → later paid update creates the Order once.
- [ ] **Step 3: address update tests:** before any shipment, replace OrderAddress + set UNVERIFIED; after shipment exists, preserve shipped address and create `ADDRESS_CHANGED_AFTER_SHIP`.
- [ ] **Step 4: cancellation tests:** QUEUED/BLOCKED fulfillment cancellation releases reservations; IN_PRODUCTION/READY_TO_SHIP/SHIPPED produces `CANCELLATION_CONFLICT`; Order becomes CANCELLED only when no active fulfillment remains.
- [ ] **Step 5: commit.**

```bash
git add apps/worker/src/channels/shopify/orders
git commit -m "feat(ingestion): handle Shopify updates cancellation and ordering"
```

---

## Task 10: Variant snapshot and SKU-mapping API

**Files:**
- Create schema model: `libs/db/prisma/schema/models/store-variant-snapshot.prisma`
- Modify Store relation in `store.prisma`
- Create migration
- Create: `apps/api/src/shopify/catalog/shopify-catalog.service.ts`
- Create: `apps/api/src/shopify/catalog/sku-mapping.controller.ts`
- Create: `apps/api/src/shopify/catalog/sku-mapping.service.ts`
- Create tests

**Schema:**

```prisma
model StoreVariantSnapshot {
  id                String   @id @default(uuid(7))
  storeId           String
  externalProductId String
  externalVariantId String
  externalSku       String?
  productTitle      String
  variantTitle      String?
  syncedAt          DateTime @db.Timestamptz(3)
  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
  @@unique([storeId, externalVariantId])
  @@index([storeId, syncedAt])
}
```

**Endpoints:**

```text
GET /app/sku-mappings?cursor=&q=
PUT /app/sku-mappings
```

- [ ] **Step 1:** GraphQL product pagination stub test (50/page) populates snapshot; snapshots younger than 10 minutes avoid refresh.
- [ ] **Step 2:** list API returns only current tenant store, unmapped first, supports SKU-code search.
- [ ] **Step 3:** PUT creates/remaps `StoreSkuMapping`; request contains `externalVariantId` + internal `skuId`, not organizationId.
- [ ] **Step 4:** mapping save requeues matching `SKU_NOT_MAPPED` records for that store, sets `nextAttemptAt=now`, and resolves the open exception when processing later succeeds.
- [ ] **Step 5:** commit.

```bash
git add libs/db apps/api/src/shopify/catalog
git commit -m "feat(shopify): variant snapshot SKU mapping and automatic retry"
```

---

## Task 11: Merchant Orders API and exception actions

**Files:**
- Create: `apps/api/src/merchant/orders/merchant-orders.controller.ts`
- Create: `apps/api/src/merchant/orders/merchant-orders.service.ts`
- Create: `apps/api/src/merchant/exceptions/merchant-exceptions.controller.ts`
- Create: `apps/api/src/merchant/exceptions/merchant-exceptions.service.ts`
- Create tests
- Modify `apps/api/src/app.module.ts`

**Endpoints:**

```text
GET  /app/orders?attention=true&cursor=
GET  /app/orders/:id
PATCH /app/orders/:id/address
POST /app/exceptions/:id/retry
POST /app/exceptions/:id/cancellation-decision
```

- [ ] **Step 1:** tenant-bound list/detail tests; another org's ids return 404.
- [ ] **Step 2:** whitelist test: merchant APIs may expose only `SKU_NOT_MAPPED`, `INVALID_ADDRESS`, `ADDRESS_CHANGED_AFTER_SHIP`, `CANCELLATION_CONFLICT`, `CHANNEL_SYNC_FAILED`.
- [ ] **Step 3:** address correction sets validation VALID and records AuditLog before/after.
- [ ] **Step 4:** retry action may only retry retryable merchant-visible exceptions; it cannot mutate INTERNAL exceptions.
- [ ] **Step 5:** commit.

```bash
git add apps/api/src/merchant apps/api/src/app.module.ts
git commit -m "feat(merchant): tenant-scoped orders and exception actions"
```

---

## Task 12: Finish embedded Orders + SKU Mapping UI

**Files:**
- Create: `apps/shopify-web/src/pages/orders-page.tsx`
- Create: `apps/shopify-web/src/pages/order-drawer.tsx`
- Create: `apps/shopify-web/src/pages/sku-mappings-page.tsx`
- Create: `apps/shopify-web/src/components/exception-action.tsx`
- Create: `apps/shopify-web/src/lib/types.ts`
- Modify: `apps/shopify-web/src/app.tsx`
- Add UI tests for pure view-model helpers; add Playwright smoke later in Task 27.

- [ ] **Step 1:** Orders renders Order #, placed time, derived fulfillment status, merchant-visible exception badge, tracking; needs-attention sorts first.
- [ ] **Step 2:** order drawer shows items, mapping state, fulfillment/shipment summaries and allowed inline actions.
- [ ] **Step 3:** SKU Mapping renders Shopify variants, unmapped-first, internal SKU search/select, save + optimistic feedback.
- [ ] **Step 4:** Store ERROR renders a reconnect/open-app banner; no separate Connect screen.
- [ ] **Step 5:** run build and API integration smoke.
- [ ] **Step 6:** commit.

```bash
git add apps/shopify-web
git commit -m "feat(shopify-web): merchant orders exceptions and SKU mapping UI"
```

### Gate M3

Manual dev-store E2E:

```text
paid mapped order -> Order + OrderItems appear
paid unknown SKU -> Needs attention
map SKU in embedded app -> record requeues automatically -> Order appears
unpaid order -> HELD -> paid update -> Order appears
```

Record screenshots. Do not start fulfillment-core work until this loop is stable.

---

# M4 — Routing, inventory/BOM reservation, fulfillment lifecycle, shipment creation

## Task 13: Deterministic V1 routing service

**Files:**
- Create: `apps/worker/src/core/routing/routing.service.ts`
- Create tests
- Create: `docs/adr/ADR-08-v1-single-facility-routing.md`

**Interfaces:**

```ts
routeOrder(orderId: string): Promise<{ routingDecisionId: string; fulfillmentId?: string }>;
```

V1 rule: one order is routed to one facility. Candidate eligibility = facility ACTIVE + capability enabled for every SKU. Score = explicit `priority` first, then lower `leadTimeHours`; tie-break by facility code for determinism. Inventory availability is advisory at routing time; reservation remains authoritative.

- [ ] **Step 1:** tests for eligible/ineligible facilities, deterministic tie-break, no-route exception.
- [ ] **Step 2:** selected route transaction creates `RoutingDecision(SELECTED)`, one `Fulfillment(ORIGINAL, QUEUED)`, and one FulfillmentItem per OrderItem.
- [ ] **Step 3:** no candidate creates `RoutingDecision(NO_ROUTE)` + INTERNAL `NO_ELIGIBLE_FACILITY` and no Fulfillment.
- [ ] **Step 4:** wire accepted/unheld orders to `routeOrder()` in the ingestion worker. After the Fulfillment is created, invoke `reserveFulfillment()`; reservation failure blocks the Fulfillment and surfaces the typed inventory exception rather than rolling back the canonical Order.
- [ ] **Step 5:** ADR explicitly records single-facility V1; multi-facility split is out of scope.
- [ ] **Step 6:** commit.

---

## Task 14: Atomic inventory reservation for MTO and stock SKUs

**Files:**
- Create: `apps/worker/src/core/inventory/inventory-reservation.service.ts`
- Create: `apps/worker/src/core/inventory/inventory-ledger.service.ts`
- Create tests with real Postgres

**Interfaces:**

```ts
reserveFulfillment(fulfillmentId: string): Promise<void>;
releaseFulfillment(fulfillmentId: string): Promise<void>;
consumeForProduction(fulfillmentId: string): Promise<void>;
consumeForShipment(fulfillmentId: string): Promise<void>;
```

- [ ] **Step 1:** MTO expansion test: active BOM × fulfillment quantity, including wastage, creates component reservations.
- [ ] **Step 2:** FROM_STOCK test: reserves the SKU's `InventoryItem` directly.
- [ ] **Step 3:** atomic SQL test with stock=10 and 20 concurrent reservations of qty=1 → exactly 10 succeed, balance invariant holds.
- [ ] **Step 4:** every reserve/release/consume transaction writes `InventoryMovement` with unique idempotency keys (`reserve:`, `release:`, `consume:`).
- [ ] **Step 5:** insufficient stock blocks Fulfillment and creates one INTERNAL `INSUFFICIENT_STOCK` exception; no negative balance.
- [ ] **Step 6:** release is idempotent and only affects ACTIVE reservations.
- [ ] **Step 7:** commit.

---

## Task 15: Fulfillment state transitions

**Files:**
- Create: `apps/api/src/operator/fulfillments/fulfillment-command.controller.ts`
- Create: `apps/api/src/operator/fulfillments/fulfillment-command.service.ts`
- Create tests

**Note:** This is intentionally an API-only internal operator surface for V1; do not build a second full dashboard. Protect it with a dev/demo operator API key in non-production and disable the routes in production unless `OPERATOR_API_KEY` is configured. No merchant route can call these commands.

**Endpoints:**

```text
POST /operator/fulfillments/:id/start
POST /operator/fulfillments/:id/complete-production
POST /operator/fulfillments/:id/ship
```

- [ ] **Step 1:** start requires QUEUED and active reservations; changes to IN_PRODUCTION.
- [ ] **Step 2:** complete production consumes MTO component reservations, sets producedQuantity, changes to READY_TO_SHIP.
- [ ] **Step 3:** invalid transitions return 409 and do not mutate inventory.
- [ ] **Step 4:** every human command writes AuditLog.
- [ ] **Step 5:** commit.

---

## Task 16: Manual shipment creation and transactional outbox emit

**Files:**
- Create: `apps/api/src/operator/shipments/shipment.service.ts`
- Create tests
- Modify operator fulfillment command service

**Interfaces:**

```ts
shipFulfillment(input: {
  fulfillmentId: string;
  items: Array<{ fulfillmentItemId: string; quantity: number }>;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
}): Promise<Shipment>;
```

- [ ] **Step 1:** shipping guard rejects missing/INVALID/UNVERIFIED address.
- [ ] **Step 2:** partial shipment validates cumulative shipped qty <= fulfillment-item qty.
- [ ] **Step 3:** same transaction: create Shipment + ShipmentItems, snapshot address, consume FROM_STOCK reservation quantities, set Shipment to `IN_TRANSIT`, update Fulfillment status (`PARTIALLY_SHIPPED` or `SHIPPED`), and insert OutboxEvent `handler=shopify.fulfillment.plan`, `eventKey=shipment.sync-plan:{shipmentId}`, `aggregateType=Shipment`, `aggregateId=shipmentId`, payload `{shipmentId}` only. Planning is internal; external GraphQL mutations are split into one side-effect row each in M5.
- [ ] **Step 4:** duplicate tracking/provider violates uniqueness cleanly; no partial inventory/outbox write.
- [ ] **Step 5:** commit.

### Gate M4

Using a canonical Shopify-ingested order:

```text
Order -> route -> reserve -> start -> complete-production -> ship
```

Assertions: no inventory drift; shipment exists; exactly one PENDING `shopify.fulfillment.plan` outbox event.

---

# M5 — Shopify FulfillmentOrder resolve + closed-loop tracking sync

## Task 17: FulfillmentOrder resolver and cache

**Files:**
- Modify: `libs/db/prisma/schema/models/shopify-fulfillment-order-line.prisma`
- Create migration: `libs/db/prisma/migrations/<timestamp>_shopify_fo_location/migration.sql`
- Create: `apps/worker/src/channels/shopify/fulfillment/shopify-fulfillment-order-resolver.ts`
- Create: `apps/worker/src/channels/shopify/fulfillment/fulfillment-order-routing-complete.handler.ts`
- Create GraphQL fixtures/stub tests

**Interfaces:**

```ts
resolveForOrder(orderId: string, options?: { force?: boolean }): Promise<ResolvedFulfillmentOrderLine[]>;
```

- [ ] **Step 1:** add nullable `assignedLocationId String?` to `ShopifyFulfillmentOrderLine` and migrate.
- [ ] **Step 2:** GraphQL stub returns fulfillment orders/line items + assigned location and maps Shopify line-item id back to `OrderItem.externalLineId`.
- [ ] **Step 3:** upsert `ShopifyFulfillmentOrderLine` by `fulfillmentOrderLineItemId` with current remainingQuantity/resolvedAt/assignedLocationId.
- [ ] **Step 4:** `fulfillment_orders/order_routing_complete` ingestion handler refreshes cache.
- [ ] **Step 5:** cache miss in caller lazily queries Shopify; empty result is a retryable condition, not a business failure.
- [ ] **Step 6:** fulfillment orders assigned to unsupported third-party/fulfillment-service locations are not silently fulfilled; surface `CHANNEL_SYNC_FAILED` with a clear reason because V1 intentionally requests only merchant-managed scopes.
- [ ] **Step 7:** commit.

---

## Task 18: Plan Shopify fulfillment side effects, then execute one mutation per outbox row

**Files:**
- Create: `apps/worker/src/channels/shopify/fulfillment/shopify-fulfillment-plan.handler.ts`
- Create: `apps/worker/src/channels/shopify/fulfillment/shopify-fulfillment-create.handler.ts`
- Create tests with fake GraphQL server
- Modify: `apps/worker/src/queue/handler-registry.ts` registration wiring

**Interfaces:**

```text
shopify.fulfillment.plan   -- internal planner; no external mutation
shopify.fulfillment.create -- exactly one Shopify fulfillmentCreate mutation
```

- [ ] **Step 1:** planner loads ShipmentItems, resolves cached/lazy FulfillmentOrder lines, validates remaining quantities, and groups allocations by `assignedLocationId`.
- [ ] **Step 2:** in one DB transaction the planner marks its own event complete and creates one child OutboxEvent per location group: `eventKey=shipment.sync:{shipmentId}:{assignedLocationId}`, `aggregateType=Shipment`, `aggregateId=shipmentId`, handler `shopify.fulfillment.create`, payload `{shipmentId, assignedLocationId, allocations:[{fulfillmentOrderId, fulfillmentOrderLineItemId, quantity}]}`. This preserves the invariant **one outbox row = one external side effect**.
- [ ] **Step 3:** quantity mismatch/manual Shopify fulfillment creates merchant-visible `CHANNEL_SYNC_FAILED`; do not emit create events.
- [ ] **Step 4:** create-handler test sends exactly one `fulfillmentCreate` mutation for its event, with line items + quantities + tracking + `notifyCustomer: true`.
- [ ] **Step 5:** if `Shipment.externalFulfillmentId` already exists and there is only one location group, handler returns success without a second mutation. For future multi-group support, persist returned fulfillment ids in event delivery details/cache rather than overwriting one shipment-level id; V1 demo data must use one Shopify location group.
- [ ] **Step 6:** successful mutation stores the returned Shopify Fulfillment gid for the V1 single-location shipment and refreshes/decrements cached remaining quantities transactionally.
- [ ] **Step 7:** `userErrors` → exception + dead-letter; 429/5xx/network → retry; honor `Retry-After`/GraphQL throttle information when present.
- [ ] **Step 8:** every external HTTP attempt inserts `DeliveryAttempt` with status/httpStatus/short response excerpt or error. Planner attempts do not create DeliveryAttempt because they make no external request.
- [ ] **Step 9:** register both handlers and commit.

```bash
git add apps/worker/src/channels/shopify/fulfillment apps/worker/src/queue
git commit -m "feat(shopify): plan and execute idempotent fulfillment sync"
```

---

## Task 19: Full dev-store closed loop

**Files:**
- Create: `scripts/demo/create-demo-shipment.ts` only if needed to simplify repeatable demos; it must call the same operator API/service, not bypass business logic.
- Create: `docs/demo/closed-loop-checklist.md`

- [ ] **Step 1:** install app on dev store and map at least one test variant.
- [ ] **Step 2:** place a paid order.
- [ ] **Step 3:** wait for ingestion → route/reserve.
- [ ] **Step 4:** validate address and progress fulfillment through operator API.
- [ ] **Step 5:** ship with synthetic tracking.
- [ ] **Step 6:** verify Shopify Order becomes Fulfilled/partially fulfilled with exact tracking.
- [ ] **Step 7:** repeat the same internal sync trigger and prove no duplicate Shopify fulfillment.
- [ ] **Step 8:** commit checklist/script only; never commit captured tokens or real customer payloads.

### Gate M5 — CV-ready gate

The dev-store flow **Shopify → FulfillFlow → Shopify** works without DB edits/manual SQL. At this point the project is eligible to go on the CV and applications can start even though reliability/polish milestones continue.

---

# M6 — Reliability, privacy/compliance, recovery, observability

## Task 20: Uninstall and privacy compliance handlers

**Files:**
- Create handlers under `apps/worker/src/channels/shopify/compliance/`
- Create tests

- [ ] `app/uninstalled`: Store DISCONNECTED, `uninstalledAt`, encrypted credentials cleared. Dead-letter pending Store aggregate events where `aggregateType=Store AND aggregateId=storeId`; dead-letter pending Shipment aggregate events whose `aggregateId` belongs to a Shipment → Fulfillment → Order for that store. Record reason `store_uninstalled`.
- [ ] `shop/redact`: purge raw webhook payloads and anonymize customer/order address fields required by the approved retention policy; write AuditLog.
- [ ] `customers/redact`: anonymize matching customer/order data supported by the webhook payload.
- [ ] `customers/data_request`: create INTERNAL operator exception/audit record containing request metadata but no unnecessary PII; V1 does not auto-export a package.
- [ ] All handlers are idempotent.
- [ ] Commit.

---

## Task 21: PII retention job and token refresh scheduler

**Files:**
- Create: `apps/worker/src/schedulers/pii-retention.scheduler.ts`
- Create: `apps/worker/src/schedulers/shopify-token-refresh.scheduler.ts`
- Create tests

- [ ] PII job purges `IngestionRecord.rawPayload` older than 30 days, sets `purgedAt`, leaves normalized non-freeform operational data required by the app.
- [ ] Token scheduler every 10 minutes finds ACTIVE stores expiring within 15 minutes and enqueues one unique `shopify.token.refresh` outbox event per store/tokenVersion.
- [ ] Register refresh handler through `ShopifyTokenManager`; rotated token response atomically replaces both tokens and both expiries.
- [ ] Use fake clock in unit tests; do not sleep real minutes.
- [ ] Commit.

---

## Task 22: Inventory ledger reconciliation

**Files:**
- Create: `apps/worker/src/core/inventory/inventory-reconcile.service.ts`
- Create scheduler + tests

- [ ] Compute expected onHand/reserved deltas from movement ledger for a controlled test inventory item and compare to `InventoryBalance`.
- [ ] mismatch creates one INTERNAL `LEDGER_DRIFT` exception keyed to facility+item and emits structured error metric/log.
- [ ] matching balance resolves/avoids duplicate open drift exception.
- [ ] Add a randomized property-style test sequence of receive/reserve/release/consume and assert balance invariants after every operation.
- [ ] Commit.

---

## Task 23: Structured logging, correlation IDs, readiness and operational metrics

**Files:**
- Create: `apps/api/src/observability/correlation.middleware.ts`
- Create: `apps/api/src/health/readiness.controller.ts`
- Create: `apps/api/src/metrics/metrics.controller.ts`
- Create: `apps/worker/src/observability/logger.ts`
- Create tests

**Metrics returned as JSON in V1 (no Prometheus dependency required):**

```text
pendingIngestionCount
oldestPendingIngestionAgeSeconds
pendingOutboxCount
oldestPendingOutboxAgeSeconds
openExceptionsByCode
reservationFailureCount (derived from exception/audit window)
shopifySyncFailures (derived from DeliveryAttempt window)
```

- [ ] `/health` remains liveness; `/ready` checks DB and returns 503 when unavailable.
- [ ] incoming `X-Correlation-Id` is preserved or UUIDv7 generated; pass to Order/Exception/Outbox/Audit where available.
- [ ] logs are JSON and redact token/auth headers and raw customer payloads.
- [ ] commit.

---

## Task 24: Reliability integration suite

**Files:**
- Create: `tests/reliability/shopify.integration.test.ts`
- Create fake Shopify HTTP server helpers

Run against real Postgres and fake Shopify server:

- [ ] duplicate webhook 3× → one ingestion record/order.
- [ ] two concurrent token refreshers → one rotation winner, both callers succeed with current token.
- [ ] stale `orders/updated` → ignored.
- [ ] unknown SKU → mapping → automatic requeue → accepted.
- [ ] 20 concurrent inventory reservations, stock 10 → exactly 10 success.
- [ ] FO unavailable → retry → later available → sync succeeds.
- [ ] same Shipment plan/create path invoked twice → one Shopify fulfillment mutation for the V1 single-location shipment.
- [ ] uninstall clears credentials and prevents new normal outbound work.
- [ ] redact purges PII.
- [ ] one worker crashes after claim; expired lease lets another worker reclaim.
- [ ] commit.

### Gate M6

`npm run build && npm test` green repeatedly (minimum 3 consecutive local runs) and CI green. No test uses production credentials or company data.

---

# M7 — Product polish for Xipat: merchant automation rules + business metrics

## Task 25: Add a minimal configurable Policy Engine

**Files:**
- Create schema: `libs/db/prisma/schema/models/automation-rule.prisma`
- Modify Organization relation
- Create migration
- Create: `apps/worker/src/core/policy/policy-engine.ts`
- Create tests

**V1 rule schema:**

```prisma
model AutomationRule {
  id             String   @id @default(uuid(7))
  organizationId String
  name           String
  enabled        Boolean  @default(true)
  priority       Int      @default(0)
  trigger        String   // ORDER_RECEIVED
  conditions     Json     // validated by application schema
  action         String   // ALLOW | HOLD
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)
  @@index([organizationId, enabled, priority])
}
```

Supported conditions only:

```text
countryCode in [...]
channelFinancialStatus in [...]
containsSku in [...]
totalItemQuantity > / >= / < / <= integer
```

- [ ] validate rule JSON with Zod before persistence.
- [ ] evaluate enabled rules by priority; first HOLD wins; otherwise ALLOW.
- [ ] HOLD creates merchant-visible `POLICY_HOLD`, leaves order created but prevents routing until resolved.
- [ ] existing “only paid” ingestion policy remains channel validation, not a configurable rule.
- [ ] commit.

---

## Task 26: Automation UI + Overview business metrics

**Files:**
- Create: `apps/api/src/merchant/automation/*`
- Create: `apps/api/src/merchant/overview/*`
- Create: `apps/shopify-web/src/pages/automation-page.tsx`
- Create: `apps/shopify-web/src/pages/overview-page.tsx`
- Modify app navigation

**Overview metrics:**

```text
ordersReceived
straightThroughOrders
straightThroughRate
needsAttention
manualTouchRate
shopifySyncSuccessRate
```

Calculate for selectable 24h/7d windows from real app data; never display invented benchmark numbers.

- [ ] CRUD API is tenant-scoped and audited.
- [ ] UI supports enable/disable, priority, conditions, HOLD/ALLOW.
- [ ] Overview documents metric definitions in tooltips/help text.
- [ ] commit.

---

## Task 27: Browser E2E and synthetic load benchmark

**Files:**
- Create Playwright config and tests under `tests/e2e/`
- Create k6 scripts under `tests/load/`
- Create: `docs/benchmarks/benchmark-method.md`

- [ ] Playwright smoke: embedded app route renders, Orders screen loads with stub auth in CI test mode, SKU mapping save calls expected API, needs-attention ordering.
- [ ] k6 synthetic webhook test sends valid HMAC requests with unique and duplicate webhook ids; measure p50/p95 intake latency and error rate.
- [ ] synthetic order processor benchmark uses generated data only and records throughput/queue lag.
- [ ] write results to `docs/benchmarks/latest.md` with machine/environment, dataset size, exact command, and measured numbers. Never claim production scale.
- [ ] commit.

### Gate M7

Merchant can understand the product from the embedded app without reading source: Overview → Orders/Exceptions → SKU Mapping → Automation. Business metrics are real measurements, not claims.

---

# M8 — Deployment, security pass, documentation, demo, CV package, main cutover

## Task 28: Create a separate Railway FulfillFlow project

**Human/external gate:** Do not modify or delete the existing `GWPrintz` project yet.

Create new Railway project `FulfillFlow` with:

```text
Postgres
api
worker
```

`api` and `worker` both source from the FulfillFlow integration branch during staging. Configure:

```text
DATABASE_URL
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
TOKEN_ENC_KEY
APP_URL
NODE_ENV=production
OPERATOR_API_KEY (only if operator commands are intentionally enabled for the demo environment)
```

- [ ] API build/deploy uses existing Dockerfile, runs migrations as a release/deploy step, and never seeds arbitrary production customer data.
- [ ] Worker uses its Dockerfile and one replica initially.
- [ ] `/health` and `/ready` green.
- [ ] app configuration `application_url`/webhook URL updated to the FulfillFlow API domain; deploy app config to the dev app.
- [ ] reinstall/reopen dev app if needed and run closed-loop test against Railway DB.

---

## Task 29: Security/data-handling review

**Files:**
- Create: `docs/security/data-handling.md`
- Create: `docs/security/threat-model.md`
- Modify README

Checklist:

- [ ] secrets only in env; no `.env*` committed.
- [ ] encrypted access + refresh token at rest.
- [ ] merchant API tenant isolation tests green.
- [ ] webhook HMAC raw body + timing-safe compare.
- [ ] protected data fields documented with purpose/retention.
- [ ] no token/raw PII in logs/outbox/audit details.
- [ ] rate limit merchant write endpoints conservatively.
- [ ] operator routes disabled unless explicit secure env configured.
- [ ] dependency audit reviewed; document accepted non-critical findings, fix critical/high exploitable findings.
- [ ] commit.

---

## Task 30: ADRs and README case study

**Files:**
- Ensure ADR-01..ADR-08 exist and match final code.
- Rewrite root `README.md`.

README order:

1. Business problem
2. Product thesis: **Automate the routine. Escalate the exceptions.**
3. 60-second architecture overview (Mermaid diagram)
4. Golden path
5. Exception/recovery path
6. Shopify integration/auth/webhook details
7. Consistency/idempotency/concurrency decisions
8. Data handling/security
9. Tests and measured benchmark
10. Local development setup
11. Trade-offs / V1 limitations

Do not open with install commands. Do not claim the project ran at company scale.

- [ ] commit.

---

## Task 31: 90-second demo and recruiter package

**Files:**
- Create: `docs/demo/demo-script.md`
- Create: `docs/portfolio/cv-bullets.md`
- Create: `docs/portfolio/interview-stories.md`

**90-second demo script:**

```text
0–10s   Shopify dev order placed
10–25s  FulfillFlow receives/auto-processes normal order
25–40s  second order with unknown SKU -> Needs attention
40–55s  merchant maps SKU -> auto retry/resume
55–70s  route/reserve/ship via internal operator command
70–85s  Shopify order shows Fulfilled + tracking
85–90s  Overview shows straight-through/manual-touch metrics
```

**CV bullets must be factual and measurable only after tests/benchmark:**

```text
- Built an embedded Shopify fulfillment automation app using React, NestJS, PostgreSQL and Shopify GraphQL/webhooks, processing orders through a durable asynchronous ingestion pipeline.
- Designed exception-driven SKU mapping and recovery workflows that automatically requeue failed orders after merchant resolution.
- Implemented idempotent webhook intake, Postgres SKIP LOCKED workers, transactional outbox delivery, token rotation, and concurrency-safe inventory reservation.
- Integrated Shopify FulfillmentOrders and tracking sync-back with retry/dead-letter handling and measured reliability/load tests on synthetic workloads.
```

Replace generic wording with real measured metrics only when available.

---

## Task 32: Final verification and cutover to `main`

Run all evidence before claiming completion:

```bash
npm ci
npm run db:validate
npm run build
npm test
# run Playwright E2E
# run selected k6 benchmark
```

Then verify against Railway + dev store:

```text
1. app opens embedded
2. bootstrap/token refresh works
3. webhook inserts once
4. mapped order accepted
5. unmapped SKU exception -> map -> auto retry
6. route/reserve/ship
7. Shopify fulfillment/tracking syncs
8. duplicate sync does not duplicate fulfillment
9. uninstall/reinstall path tested
10. privacy purge tests green
```

Only after all ten pass:

1. Ensure the old GWPrintz deployment no longer auto-deploys from `main`, or intentionally preserve it on `legacy/gwprint-v1`/a separate Railway source.
2. Open final PR `fulfillflow-v2 -> main`.
3. Require CI green.
4. Merge.
5. Watch new FulfillFlow Railway deployment to SUCCESS.
6. Smoke-test `/health`, `/ready`, embedded app and one synthetic order after merge.
7. Tag `v2.0.0-portfolio`.

Commit/tag message:

```bash
git tag -a v2.0.0-portfolio -m "FulfillFlow V2 portfolio release: Shopify closed-loop fulfillment automation"
git push origin v2.0.0-portfolio
```

### Gate M8 — DONE

FulfillFlow is “complete” for the portfolio only when all are true:

- Shopify embedded app works from a dev store.
- Real Shopify webhooks create canonical orders through durable async ingestion.
- SKU exception → merchant correction → automatic resume works.
- Routing + concurrency-safe inventory reservation + fulfillment lifecycle works.
- Shipment emits transactional outbox and Shopify becomes Fulfilled with tracking.
- Duplicate/retry/out-of-order/token-refresh/uninstall/redact cases have automated coverage.
- Separate Railway project is healthy and old GWPrintz data was never reused.
- README/ADRs/data-handling/benchmark/demo are present.
- 90-second demo is reproducible without editing DB rows.
- CI is green and final main cutover has been smoke-tested.

---

# Suggested review cadence for Claude

For every task:

1. Read this plan plus the approved Shopify design spec.
2. Inspect existing files before editing; do not assume M1 paths if the repo changed.
3. Write the failing test first.
4. Run only the smallest relevant test and confirm failure for the expected reason.
5. Implement the minimum code for the task.
6. Run targeted tests, then package tests, then root build/test at milestone gate.
7. Self-review diff for tenant leaks, tokens/PII in logs, duplicated business logic, and legacy terminology.
8. Commit with Conventional Commit message.
9. Ask for review only on a real blocker or before external/destructive actions (Shopify config release, Railway project mutation, final merge/cutover).

Do not silently expand scope into: fulfillment-service registration, returns, billing, inventory sync to Shopify, Kafka/Redis/Kubernetes, microservices, or a full internal WMS dashboard.

---

# Milestone map / expected product maturity

| Milestone | Deliverable | Portfolio readiness |
|---|---|---:|
| M1 | Core schema/API/worker/CI | completed baseline |
| M2 | Shopify install/auth/webhook durable intake | strong integration signal |
| M3 | Order ingestion + merchant UI + SKU exception recovery | product is visibly useful |
| M4 | Routing/inventory/fulfillment/shipment | backend depth |
| M5 | Shopify FulfillmentOrder + tracking sync-back | **CV-ready closed loop** |
| M6 | compliance/recovery/observability/reliability suite | production-thinking proof |
| M7 | automation rules + business metrics + load test | strong Xipat product fit |
| M8 | Railway deploy + docs + demo + final cutover | **portfolio complete** |

