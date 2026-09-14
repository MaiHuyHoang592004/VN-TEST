# M2 handover — Shopify inbound integration

**Status: acceptance gate passes.** Built on top of M1 (`ff/m1-foundation`,
PR #3), no M1 files touched except `apps/api/package.json` (test script) and
`turbo.json`/`.github/workflows/ci.yml` (new env vars).

## What M2 delivers

```
Shopify Dev Store
      ↓
Install FulfillFlow Connect     GET  /shopify/install
      ↓
Store ACTIVE exists             GET  /shopify/callback  → bootstrapShopifyStore
      ↓
valid auth/session              GET  /shopify/session   (ShopifySessionGuard)
      ↓
orders/create webhook           POST /webhooks/shopify/orders-create
      ↓
HMAC verified                   verifyWebhookHmac (raw body, base64)
      ↓
IngestionRecord (exactly one)   upsert on dedupeKey = X-Shopify-Webhook-Id
      ↓
worker claims it                IngestionClaimLoop → claimIngestion (M1 primitive)
```

Proven end to end by one test, not just its parts:
`apps/api/src/shopify/m2-acceptance.e2e.test.ts` — install → callback (Store
ACTIVE) → authenticated `/shopify/session` → `orders/create` webhook (HMAC,
one `IngestionRecord`) → `claimIngestion` picks it up. Green against real
Postgres.

## New files

| File | Responsibility |
|---|---|
| `apps/api/src/config/env.ts` (+test) | Shopify env vars, validated at load: `SHOPIFY_API_KEY/SECRET/SCOPES/APP_URL/TOKEN_ENC_KEY` |
| `apps/api/src/shopify/token-crypto.ts` (+test) | AES-256-GCM encrypt/decrypt for `Store.accessTokenEnc`, IV-prefixed |
| `apps/api/src/shopify/hmac.ts` (+test) | The two distinct Shopify HMAC schemes: webhook (base64, raw body) vs OAuth (hex, sorted query) |
| `apps/api/src/shopify/session-token.ts` (+test) | Hand-rolled HS256 verification of the App Bridge session token |
| `apps/api/src/shopify/oauth-state.ts` (+test) | Stateless, self-signed OAuth `state` (no session store, no new table) |
| `apps/api/src/shopify/oauth.service.ts` (+test) | Pure OAuth mechanics: shop validation, authorize URL, token exchange (fetch injected) |
| `apps/api/src/shopify/store-bootstrap.ts` (+test) | Upserts Organization+Store from a completed OAuth grant; rotates the token on reinstall |
| `apps/api/src/shopify/shopify-config.provider.ts` | NestJS provider wrapping `loadEnv()` for the Shopify vars |
| `apps/api/src/shopify/oauth.controller.ts` (+test) | `GET /shopify/install`, `GET /shopify/callback` |
| `apps/api/src/shopify/session.guard.ts` | `ShopifySessionGuard` — verifies `Authorization: Bearer <session token>` |
| `apps/api/src/shopify/session.controller.ts` (+test) | `GET /shopify/session`, the first protected endpoint |
| `apps/api/src/shopify/webhooks.controller.ts` (+test) | `POST /webhooks/shopify/orders-create` → `IngestionRecord` |
| `apps/api/src/shopify/shopify.module.ts` | Wires the above into `AppModule` |
| `apps/api/src/shopify/m2-acceptance.e2e.test.ts` | The full gate as one scenario |
| `apps/worker/src/queue/ingestion-claim-loop.ts` (+test) | `IngestionClaimLoop` — claims `IngestionRecord` via `claimIngestion` (M1's primitive), runs alongside `OutboxLoop` |

Modified: `apps/api/package.json` (test script now loads `.env.local`),
`apps/api/.env.example` (new), `turbo.json` and `.github/workflows/ci.yml`
(Shopify env vars added), `apps/worker/src/worker.module.ts` +
`apps/worker/src/main.ts` (run `IngestionClaimLoop` alongside `OutboxLoop`).

## Decisions made without the design spec (self-designed, flagged for review)

The task's step 2 ("read the Shopify Connect design spec sections 0–3")
pointed at `fulfillflow/specs/2026-09-11-shopify-connect-design.md (Project)`
— a Claude Project this session had no access to, and it isn't checked into
the repo. The user chose to let this session design M2 from Shopify's own
docs + the existing schema rather than block on retrieving the spec. Anything
below may need reconciling against that spec later:

1. **One Organization per shop, no separate merchant sign-up.** The shop
   domain is the tenant key (`Organization.slug = shop`). Simplest thing that
   fits the schema; a real multi-user onboarding flow is a product decision
   for later, not an M2 concern.
2. **OAuth `state` is stateless** (HMAC-signed `{shop, nonce, exp}`, no DB
   table, no session store). Avoids adding a table the schema doesn't have.
3. **Token rotation via `Store.tokenVersion`, bumped on every OAuth grant**
   (fresh install or re-auth). Nothing yet *reads* `tokenVersion` to detect a
   stale in-memory token — that consumer doesn't exist until M2.5/M3 call the
   Shopify Admin API.
4. **No `app/uninstalled` webhook handler.** Only `orders/create` is in
   scope per the task. `Store.uninstalledAt` exists in the schema but nothing
   sets it yet — needed before M6 (Reliability: "uninstall/redact").
5. **JWT/HMAC hand-rolled with `node:crypto`, no new dependency.** Both are a
   single fixed algorithm (HS256 / HMAC-SHA256); a library would add a
   dependency to verify what's ~15 lines of `createHmac`/`timingSafeEqual`.

## Explicitly NOT done (per the task's scope)

Order normalization, SKU mapping UI, routing, inventory, fulfillment,
tracking sync, policy engine — all M2.5 and later. The worker's
`IngestionClaimLoop.tick()` claims a row and does nothing else on purpose: a
claimed-but-unhandled row's lease expires and `claimIngestion` returns it, so
M2.5 adding real handling is additive, not a migration.

## Verification run (this session, against local Postgres — same steps CI runs)

| Check | Result |
|---|---|
| `prisma validate` | ✅ |
| `prisma migrate diff` (drift check) | ⚠️ pre-existing, unrelated to M2 — see below |
| `npm run build` (all 4 workspaces) | ✅ clean, 0 tsc errors |
| `npm run db:seed` | ✅ |
| `npm test` (all 4 workspaces) | ✅ **62/62** — `@fulfillflow/api` 50, `@fulfillflow/worker` 6, `@fulfillflow/db` and `@fulfillflow/shared` from M1 (cached, still green) |
| Legacy-name guard (`gwprint\|BasketPosition\|MaterialStock\|WarehouseInventory`) | ✅ clean |
| `npm run lint` | ⚠️ pre-existing gap, not run by CI either — `eslint` isn't installed in `apps/api`/`apps/worker` despite the `lint` script existing. Not introduced by M2. |

**Migration drift check note:** `prisma migrate diff` reports the
`Fulfillment.fulfillment_active_queue` partial index as "removed then added"
against a locally-created shadow database. No schema or migration file was
touched in M2 (`git status` on `libs/db` is clean). This matches the exact
Prisma partial-index regression documented in
`Claude outputs/fulfillflow-v2-schema-review.md` §10.1
(prisma/prisma#29289, #29263) — a known CLI-version-sensitive false positive,
not a real drift. GitHub Actions CI already passed this same migration+schema
pair on commit `3c1747c` (M1, pre-M2). Re-verify on the CI runner rather than
trusting a local shadow-db diff for this specific index.

## Env vars added

`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES` (default
`read_orders`), `SHOPIFY_APP_URL` (this API's own public origin, not the
shop's), `SHOPIFY_TOKEN_ENC_KEY` (base64, must decode to exactly 32 bytes —
`openssl rand -base64 32`). See `apps/api/.env.example`. CI uses dummy values
(`.github/workflows/ci.yml`); never point `SHOPIFY_TOKEN_ENC_KEY` at a real
key from a committed file.

## What M2.5 needs to add next

1. A handler in `IngestionClaimLoop` (or a new loop) that: decrypts nothing
   (webhook payload is plain), reads `IngestionRecord.rawPayload`, resolves
   each line's SKU via `StoreSkuMapping`, and creates `Order` + `OrderItem` —
   or, on an unmapped SKU, an `ExceptionCase(SKU_NOT_MAPPED)` and leaves the
   record `HELD`/`EXCEPTION` per the "all-or-nothing per order" rule from the
   schema review §6.
2. `completeIngestion`/`failIngestion` primitives in `libs/db/src/queue.ts`
   (mirroring `completeOutbox`/`failOutbox`) — `claimIngestion` exists from
   M1, but nothing settles a claimed row's `status` yet. Needed before
   `IngestionClaimLoop` can do more than claim-and-let-lease-expire.
3. `app/uninstalled` and `app/scopes_update` webhook handlers (sets
   `Store.uninstalledAt`/`status`) — deferred from M2, needed before this
   goes near a real Partner Dashboard listing.
4. Reconcile against the actual Shopify Connect design spec once it's
   available, per the decisions flagged above.
