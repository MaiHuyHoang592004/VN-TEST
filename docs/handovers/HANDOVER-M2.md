# M2 handover — Shopify inbound integration (corrected)

**Status: acceptance gate passes, corrected against the recovered Shopify
Connect design spec.** Built on top of M1 (`ff/m1-foundation`, PR #3, not
touched). This work lives on `ff/m2-shopify-review`, pushed to `origin` as a
backup — **not merged into PR #3, no new PR opened.**

## Why this doc has a "corrected" in the title

The first M2 pass (this branch's earlier commits) was built without access to
`docs/superpowers/specs/2026-09-11-shopify-connect-design.md` — it lived in a
Claude Project this session couldn't reach, and wasn't in the repo. The user
chose to let that session self-design from Shopify's own docs + the schema
rather than block. Once the actual spec (via
`2026-09-14-fulfillflow-complete-implementation-plan.md`, Tasks 1–6) was
provided, three interfaces turned out to conflict with the approved design
and were reconciled here. **The crypto/HMAC/durable-ingestion/worker
building blocks underneath were sound and mostly unchanged** — only the HTTP
integration boundary was wrong.

## What changed, and why

### 1. Managed installation replaces the OAuth redirect flow

**Removed entirely:** `GET /shopify/install`, `GET /shopify/callback`,
`oauth.controller.ts`, `oauth-state.ts` (stateless CSRF state — no longer
needed, there's no redirect to protect), `oauth.service.ts` (authorization-
code exchange), and `verifyOAuthHmac` from `hmac.ts` (the query-string HMAC
scheme only applies to redirect-based OAuth).

**In their place:** the embedded app's first (and every) load hands the API
its App Bridge **ID token**. `POST /app/session/bootstrap`
(`ShopifySessionGuard` — verifies the token, doesn't require a Store to
already exist) exchanges that ID token directly for an offline access token
via Shopify's **token-exchange grant** (`shopify-auth.client.ts:
exchangeIdToken`) and bootstraps the tenant. No redirect, no `code` param, no
`state`.

### 2. A real token lifecycle (`token-manager.ts`)

`ShopifyTokenManager.withAccessToken(storeId, fn)` is meant to be the one
place Admin API calls go through (nothing calls it yet in M2 — no Admin API
calls happen this milestone):

- Refreshes the access token before calling `fn` if it expires within 5
  minutes (only for stores that actually got a refresh token — Shopify can
  still return a classic non-expiring token for some app configurations).
- If `fn` throws `ShopifyUnauthorizedError` (the caller's signal for "Shopify
  said 401"), refreshes once and retries `fn` once. A second 401 propagates.
- Refresh rotates `Store.accessTokenEnc`/`refreshTokenEnc`/both expiries via
  an **optimistic `tokenVersion` compare-and-swap** — two concurrent
  refreshers race on `UPDATE ... WHERE tokenVersion = X`; exactly one wins,
  and the loser just re-reads the row and gets the winner's (equally valid)
  token instead of erroring or double-writing.
- An unrecoverable refresh (Shopify rejects the refresh token) marks the
  `Store` `ERROR`, clears both encrypted tokens, and opens one
  `ExceptionCase(CHANNEL_SYNC_FAILED, visibility: MERCHANT)` keyed to
  `store:<id>` — recovery requires the merchant to reopen the app, which
  re-runs bootstrap.

`store-bootstrap.ts` now also creates the `User(shopifyUserId)` + one
`OrganizationMembership(role: OWNER)` the spec's `TenantContext` needs (it
previously only touched `Organization`/`Store`), and persists both token
expiries. `Store.refreshTokenExpiresAt` is a new column
(`20260914085351_shopify_refresh_token_expiry`, a normal migration on top of
M1's init — M1's migration itself is untouched). `token-crypto.ts` gained the
spec's 1-byte format-version prefix ahead of the IV+tag+ciphertext.

**Known simplification, flagged for M6:** two concurrent `refresh()` calls
each make their own network call to Shopify before the DB decides a winner
(no single-flight de-duplication). The DB-level optimistic lock still
prevents a torn/inconsistent row; it just means a real race costs one extra
Shopify API call, not correctness.

### 3. One canonical webhook endpoint

`POST /webhooks/shopify` (was `/webhooks/shopify/orders-create`) replaces the
per-topic route. It reads `X-Shopify-Topic` and records it verbatim on
`IngestionRecord.topic` — the controller does not branch on topic at all;
dispatch-by-topic is the M3 ingestion worker's job. Two other behavior fixes
to match the spec exactly:

- Returns **200** on a successful durable insert (was 201).
- An HMAC-valid webhook for a shop with **no installed Store** returns
  **200 `{ok:true, ignored:true}`**, not 404 — Shopify isn't lying to us,
  there's just nothing to attach the record to, and a non-2xx would make
  Shopify retry forever.

Everything else — raw-body HMAC verification, `dedupeKey` = 
`X-Shopify-Webhook-Id` upsert idempotency, no business processing in the
request path — carried over unchanged.

### New: `ShopifyTenantGuard` / `TenantContext` / `@CurrentTenant()`

`ShopifySessionGuard` only proves the *token* is valid — that's correct for
bootstrap, where a Store legitimately might not exist yet. Every other
`/app/**` route needs strictly more: a valid token **and** an existing
**ACTIVE** Store. `ShopifyTenantGuard` (new) enforces that and attaches a
`TenantContext` (`{organizationId, storeId, userId, shopDomain}`) via
`@CurrentTenant()`. `GET /app/session` uses it; a valid token for an
uninstalled/never-bootstrapped shop is now a clean 401, not a silent 404 (the
first M2 pass's session endpoint returned 404 here, which is itself the kind
of easy-to-miss boundary bug this correction pass exists to catch).

## Unaffected (carried over as-is)

`token-crypto.ts` (AES-256-GCM round-trip, tamper/wrong-key detection — only
the format-version byte was added), `hmac.ts`'s `verifyWebhookHmac`,
`session-token.ts` (App Bridge ID-token HS256 verification — this **is** the
building block Task 4 calls for), `IngestionClaimLoop` in
`apps/worker` (untouched — it claims `IngestionRecord` regardless of how the
row got there), and the durable-upsert idempotency pattern in the webhook
handler.

## Explicitly NOT done (per the correction's scope)

Order normalization, SKU mapping UI, routing, inventory, fulfillment,
tracking sync, policy engine, the embedded React/Vite shell
(`apps/shopify-web`), `shopify.app.toml` — all out of scope for this
correction pass and belong to later M2/M3+ tasks in the recovered plan.

## Verification run (this session, against local Postgres)

| Check | Result |
|---|---|
| `prisma validate` | ✅ |
| New migration (`shopify_refresh_token_expiry`) applies cleanly on top of M1's init | ✅ |
| `npm run build` (all 4 workspaces) | ✅ clean, 0 tsc errors |
| `npm test` (all 4 workspaces) | ✅ **56/56** — `@fulfillflow/api` 46, `@fulfillflow/worker` 6, `@fulfillflow/db` 4 |
| Legacy-name guard | ✅ clean |
| M2 acceptance gate as one e2e scenario (`m2-acceptance.e2e.test.ts`) | ✅ bootstrap (ID token → token exchange → Store ACTIVE) → `/app/session` → `orders/create` via `/webhooks/shopify` (HMAC, one `IngestionRecord`) → `claimIngestion` |

`prisma migrate diff` still reports the same pre-existing false-positive
partial-index drift on `Fulfillment.fulfillment_active_queue` noted in the
first M2 handover (Prisma issue prisma/prisma#29289/#29263) — unrelated to
this work, already green on GitHub Actions CI for M1.

## Env vars (unchanged from the first M2 pass)

`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES`, `SHOPIFY_APP_URL`
(now just the app's base URL — no redirect_uri to build), `SHOPIFY_TOKEN_ENC_KEY`.
See `apps/api/.env.example`.

## What's next

1. **M2.5 / M3, Task 7 onward** in the recovered plan: an ingestion worker
   handler registry that dispatches on `IngestionRecord.topic`, normalizes
   `orders/create` into `Order`/`OrderItem` (or an `ExceptionCase` on an
   unmapped SKU/unpaid order), and handles `orders/updated`/`orders/cancelled`.
2. `completeIngestion`/`failIngestion` primitives in `libs/db/src/queue.ts`
   (mirroring `completeOutbox`/`failOutbox`) — `claimIngestion` exists from
   M1, but nothing settles a claimed row's status yet.
3. Wire `ShopifyTokenManager` into an actual Admin API caller (GraphQL
   client) once one exists — nothing consumes it yet.
4. `app/uninstalled` / compliance topic handling (Task 20, M6) — the webhook
   endpoint durably records these topics today but nothing processes them.
5. Reconcile `apps/shopify-web`, `shopify.app.toml`, and the rest of Tasks
   1–2 whenever the embedded UI work starts — deliberately not touched here.
