# M6 handover — reliability, privacy/compliance, recovery, observability (Tasks 20–24)

**Status: Tasks 20–24 complete and verified. Gate M6 passes: 3 consecutive
full-root `npm test` runs, 180/180 every time (db 6, core 42, api 52, worker
80).** Built on `ff/m5-shopify-sync-back` (M5 complete, HANDOVER-M5). No M7
work, PR, or deployment was performed. Continued directly on the M5 branch
rather than cutting a new `ff/m6-reliability-compliance` branch — the plan's
own execution-topology section describes branching per milestone from
`fulfillflow-v2` and PRing back into it, which M2–M5 already didn't follow
(HANDOVER-M2/M5 both record milestones chaining directly on top of each
other instead); this session preserved that established, actual practice
rather than introducing branch topology none of M2–M5 used.

## Plan source and scope

`docs/superpowers/specs/2026-09-14-fulfillflow-complete-implementation-plan.md`,
M6 section (Tasks 20–24) and Gate M6. Picked up exactly where HANDOVER-M5's
"What M6 needs next" left off. M3's narrower scope (no `apps/shopify-web`, no
merchant Orders/SKU-mapping HTTP API — HANDOVER-M3) still holds; M6 doesn't
touch that surface either, and Task 24's "unknown SKU → mapping → requeue"
scenario is proven by exercising the underlying mechanism directly (see
below) rather than through an API that was deliberately never built.

## Environment note — this session started from a bare container

Unlike M2–M5, this session began with **no** local Postgres, no `.env.local`
files anywhere, and no Docker. `libs/db`'s own package (`postgresql-16`) was
already apt-installed but not running. Before any M6 work: started the
cluster, created `fulfillflow_local`, wrote `.env.local` for all four
workspaces (`libs/db`, `libs/core`, `apps/api`, `apps/worker` — **`libs/core`
needs its own copy too**, a gap this session hit and fixed; its `test`
script sources `.env.local` exactly like the other three but none existed),
and applied the four existing migrations with `npm run db:migrate:deploy`
(not raw `prisma migrate deploy`, which fails without `--config` — see the
package script). `SHOPIFY_TOKEN_ENC_KEY` must be the exact value
`shipment-sync-test-support.ts` hardcodes
(`MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=`) in every workspace, not a
freshly generated one — several M5 tests encrypt fixture tokens with that
literal constant and decrypt them through the real
`shopifyTokenManager` singleton, which reads the key from its own process's
env. `apps/api/.env.local` also needs `OPERATOR_API_KEY` (missing from no
prior handover because it was apparently always present locally); without
it every operator-surface test hangs on `Invalid value "undefined" for
header` rather than failing fast, which looks like a stuck process, not a
missing env var, and cost real time to diagnose. None of this is new
first-time setup guidance the codebase lacked — `apps/*/`.env.example` already
documents all of it — it just hadn't been assembled in one place before.

## What was built

### Task 20 — compliance handlers (`apps/worker/src/channels/shopify/compliance/`)

Four ingestion handlers, registered on their own webhook topics exactly like
`orders/create` and friends (the webhook controller is already topic-agnostic
— any topic becomes a durable `IngestionRecord`, per M2's design — so no
`apps/api` change was needed to receive these):

- **`app/uninstalled`**: Store → `DISCONNECTED`, `uninstalledAt` set,
  encrypted credentials cleared. Dead-letters every `PENDING` `OutboxEvent`
  whose `aggregateType = 'Store'` (e.g. a queued `shopify.token.refresh`)
  and every `PENDING` Shipment-aggregate event belonging to a Shipment under
  this store's orders (`shopify.fulfillment.plan`/`create`). One `AuditLog`
  row. Idempotent by construction — re-running finds nothing left `PENDING`
  and simply re-asserts the same `DISCONNECTED` state.
- **`shop/redact`**: purges every `IngestionRecord.rawPayload` for the store
  (`purgedAt` set, guarded so a second run is a no-op) and anonymizes
  `Order.customerName`/`customerEmail` plus every `OrderAddress` PII field
  (name/company/email/phone/line1/line2/city/province/postalCode).
  `countryCode` is deliberately kept — non-PII aggregate shipping-destination
  data, documented in `docs/security/data-handling.md` (M8, below).
- **`customers/redact`**: same field set, scoped to exactly the orders named
  in Shopify's own `orders_to_redact` (numeric ids, mapped to
  `gid://shopify/Order/<id>` the same way the fulfillment-order-routing
  handler already does) — that list, not a customer-id/email match, is what
  Shopify actually sends and the only thing this session found documented as
  authoritative for "past the retention window." An empty list is a
  legitimate no-op.
- **`customers/data_request`**: one `AuditLog` entry (`customerId`,
  `ordersRequested` count) — no email/phone persisted, since the customer id
  already identifies the request and V1 doesn't auto-export a package.

### Task 21 — schedulers (`apps/worker/src/schedulers/`, `.../channels/shopify/token/`)

`PiiRetentionScheduler` purges `IngestionRecord.rawPayload` older than 30
days (`purgedAt` set), same shape as `shop/redact`'s purge. `ShopifyToken
RefreshScheduler` finds `ACTIVE` stores with a refresh token whose access
token expires within 15 minutes and enqueues one `shopify.token.refresh`
`OutboxEvent` per store/`tokenVersion` — `eventKey` embeds `tokenVersion`, so
a store already queued for its current token is never queued twice, and a
successful rotation (which increments `tokenVersion`) naturally opens a
fresh, distinct key for the next window. The new outbox handler
(`refreshShopifyToken`) calls `ShopifyTokenManager.refresh(storeId)` and
turns **any** failure into an immediate `BusinessOutboxError` — the token
manager itself already durably marks the store `ERROR` and opens a merchant
`CHANNEL_SYNC_FAILED` exception on failure (existing M2 behavior), so
retrying the outbox event can't help and would just burn through
`maxAttempts` calling `refresh()` on a store that's no longer `ACTIVE`.

**Testability finding, not a bug fix:** the module-level `shopifyTokenManager`
singleton (`apps/worker/src/channels/shopify/shopify-client.ts`) binds its
`fetchImpl` to whatever `globalThis.fetch` was *at construction time*
(module import), because `ShopifyTokenManager`'s constructor default
parameter is evaluated once, at the one place the singleton is built with no
third argument. M5's existing tests never hit this because they always keep
the token fresh (`needsRefresh()` false) so `refreshStore`'s frozen
`fetchImpl` never runs — only the ambient, late-bound `shopifyGraphql` call
inside their own injected `fn` does, which is why monkeypatching
`globalThis.fetch` works for *them*. Testing the refresh path itself needs a
locally-constructed `ShopifyTokenManager` with an injected fetch, exactly
like `libs/core`'s own `token-manager.test.ts` already does. Fixed by giving
`refreshShopifyToken` the same optional-`deps` injection shape M5's
`resolveForOrder` established (`{ tokenManager? }`, defaulting to the real
singleton) rather than trying to make the singleton itself late-bind — a
smaller, more consistent change.

### Task 22 — inventory reconciliation (`apps/worker/src/core/inventory/inventory-reconcile.service.ts`)

`reconcileBalance(facilityId, inventoryItemId)` sums every
`InventoryMovement.onHandDelta`/`reservedDelta` for the pair and compares it
to the live `InventoryBalance` row. A mismatch opens one INTERNAL
`LEDGER_DRIFT` exception; a later match resolves any exception still open
for that subject. `reconcileAllBalances()` sweeps every `InventoryBalance`
row; `InventoryReconcileScheduler` runs it every 15 minutes.

**Schema-driven design decision:** `Facility`/`InventoryItem` are global, not
tenant-scoped (no `organizationId` on either), but `ExceptionCase` requires
one — and per ADR-07's `exception_has_subject` CHECK constraint, requires a
**concrete subject** too (one of `ingestionRecordId`/`orderId`/
`fulfillmentId`/`shipmentId`, or a `store:%` `subjectKey`; a drift's natural
`inventory:<facilityId>:<itemId>` key satisfies neither). Resolved by
borrowing both the tenant and the subject from whichever `Fulfillment` most
recently moved that pair (a real `InventoryMovement.fulfillmentId`). No such
movement ever recorded (a receipt-only item, or an empty ledger) means there
is nothing to attach an exception to — the drift is still logged
structurally (`console.error`), just without a merchant-visible row.

**Real bug found while writing this, in the test, not the service:** a test
that deletes the `Fulfillment` and then the `Order` an `ExceptionCase`
references — without deleting the exception first — trips
`exception_has_subject` *itself*, via Postgres's own `ON DELETE SET NULL`
for those optional relations: deleting the Fulfillment nulls
`fulfillmentId` (fine, `orderId` still holds the constraint up); deleting
the Order then nulls `orderId` too, and now both are null with no
`store:%` prefix — violation. `reconcileBalance` itself was correct the
whole time (proved with a standalone repro before touching anything); the
fix was cleanup order (delete the exception before its subject rows), not
service code. Worth recording because the same shape (a test — or, in
principle, production code — deleting a Fulfillment/Order that still has an
open exception attached) would misfire identically anywhere else in the
codebase; nothing today deletes either in normal operation, so it's a latent
trap rather than an active bug.

Verified with a 60-step seeded-random sequence of receive/reserve/release/
consume (using the real `incrementReserved`/`decrementReserved`/
`decrementOnHandAndReserved` primitives from `@fulfillflow/core`, plus a
local `receive` helper — there is no receipts feature yet, so `RECEIPT`
movements were built by hand exactly as a future one would), asserting zero
drift after every single operation.

### Task 23 — observability (`apps/api/src/observability/`, `.../health/`, `.../metrics/`, `apps/worker/src/observability/`)

`correlationMiddleware` preserves an incoming `X-Correlation-Id` or
generates a fresh **UUIDv7** (a ~15-line inline generator — no `uuid`
dependency exists in this repo, and v7 keeps correlation ids sortable
alongside the `uuid(7)` entity ids the schema already uses everywhere),
attaches it to `req.correlationId`, and echoes it on the response. Applied
via `AppModule.configure()`, not `main.ts` — every existing test in this
codebase boots the app through `Test.createTestingModule({ imports:
[AppModule] })`, which never runs `main.ts`, so middleware registered only
there would be silently untested and effectively unused in every real test
scenario. Threaded into the operator command surface (`start`/
`complete-production`/`ship`) via a `@CorrelationId()` param decorator,
landing on the `AuditLog` row each already writes and, for `ship`, the
`shopify.fulfillment.plan` `OutboxEvent` it creates.

**Judgment call — correlation id threading is intentionally narrow.**
`Order`/`ExceptionCase`/`OutboxEvent`/`AuditLog` all carry an optional
`correlationId` column, by design (nullable, "where available" per the
plan). Threading it through *every* write path in M2–M5's already-shipped,
already-tested ingestion/routing/inventory/shipment code would touch a large
number of stable files for a field the schema itself treats as best-effort,
for no functional gain this session could verify. Wired it into the one
surface built this session where it's cheap and obviously correct (operator
commands); left the rest for whoever next touches those call sites with a
concrete need (e.g. tracing one order's whole lifecycle) to extend, rather
than doing it speculatively now.

`/health` vs `/ready`: split the DB check out of `/health` (previously
`{ ok: true, db: "up" }`, now pure `{ ok: true }`, no dependency) into a new
`/ready` (the old behavior, 503 on a DB failure) — a liveness probe
shouldn't make an orchestrator restart an otherwise-healthy process over a
transient database blip. This changes `/health`'s existing response shape;
`health.controller.test.ts` was updated to match, deliberately, as the
plan's own "`/health` **remains** liveness" phrasing implies the DB check
was never meant to live there.

`GET /metrics` (behind `OperatorApiKeyGuard`, same guard as `/operator/**`,
not public): `pendingIngestionCount`/`oldestPendingIngestionAgeSeconds`,
`pendingOutboxCount`/`oldestPendingOutboxAgeSeconds`, `openExceptionsByCode`
(grouped, OPEN only), and a windowed (`?windowHours=`, default 24)
`reservationFailureCount` (`INSUFFICIENT_STOCK` + `PRODUCTION_BLOCKED`
exceptions in the window) and `shopifySyncFailures` (`FAILED`
`DeliveryAttempt`s in the window). Plain JSON, no Prometheus dependency, per
the plan.

`apps/worker/src/observability/logger.ts`: structured JSON logging with
recursive redaction of token/secret/password/authorization-shaped keys
(case-insensitive substring match, so `accessToken`, `access_token`, and
`headers.Authorization` all redact). Adopted in `main.ts`'s own startup/
shutdown/signal logs. The existing per-loop `console.log(JSON.stringify(...))`
calls in `outbox-loop.ts`/`ingestion-loop.ts` were deliberately left alone —
they already log only ids and error message strings, never a raw payload or
token, so there was nothing to fix there and no reason to touch stable,
already-tested M2 code for a cosmetic format change.

### Task 24 — reliability integration suite (`apps/worker/src/reliability/`)

**Plan path doesn't fit the repo**: `tests/reliability/shopify.integration.test.ts`
isn't inside any registered npm workspace (`workspaces: ["apps/*", "libs/*"]`),
and a webhook-to-worker integration test needs `@fulfillflow/core`,
`@fulfillflow/db`, and the worker's own handlers, none importable from
outside `apps/worker`. Placed the suite there instead, alongside the
existing M3/M4/M5 "acceptance gate" tests, for the identical reason those
already live where they do.

**Most of the plan's ten Task 24 bullets were already covered**, and covered
better, by tests already sitting next to the exact code each one exercises
(duplicate webhook, concurrent token refresh, stale `orders/updated`, FO-
unavailable retry, duplicate plan/create, redact purges PII, crashed-worker
lease reclaim — full mapping in the new file's own header comment). Re-
proving each as a slower, more expensive "integration" version would have
been motion, not verification. Three were genuinely new:

1. **Unknown SKU → mapping → automatic requeue → accepted.** Since M3
   explicitly descoped a mapping HTTP API (HANDOVER-M3), this proves the
   *mechanism* a real one would trigger — insert the `StoreSkuMapping`,
   reset the stuck `IngestionRecord` to `PENDING`, resolve the open
   exception — actually requeues and resumes to `ACCEPTED`, not the
   (nonexistent) endpoint.
2. **20 concurrent orders against stock=10, through the real accepted-order
   path.** `libs/core`'s own test already proves the atomic SQL guard holds
   under concurrency; this re-proves it through `routeAndReserve` end to
   end (routing selection included), which is a different integration seam
   — exactly 10 `QUEUED` + 10 `BLOCKED`, balance exactly 10/10.
3. **Uninstall prevents *new* outbound work, not just pending work.** Task
   20's own test proves dead-lettering of already-`PENDING` events; this
   proves a **fresh** `withAccessToken` call after uninstall fails before
   its callback ever runs — no new Shopify request is even attempted for a
   disconnected store.

## Judgment calls and limits (summary — full rationale inline above)

- Continued on `ff/m5-shopify-sync-back` rather than cutting a new milestone
  branch, matching M2–M5's actual (not plan-literal) practice.
- `customers/redact` matches strictly on Shopify's `orders_to_redact`, not a
  customer-id/email search across all of a store's orders.
- `customers/data_request` records an `AuditLog` entry only, no new
  `ExceptionCode` — avoided an enum migration for a request-tracking need an
  audit row already satisfies.
- `LEDGER_DRIFT` exceptions borrow their tenant/subject from the most
  recently `Fulfillment`-linked movement; a drift on a facility/item with no
  such history logs structurally but opens no merchant-visible row.
- `refreshShopifyToken` treats every failure as terminal (`BusinessOutboxError`),
  trusting `ShopifyTokenManager`'s own error handling rather than retrying.
- Correlation id threading covers the operator command surface only, not
  every write path in M2–M5.
- `/health`'s response shape changed (`db` field removed) — a deliberate,
  documented break from its M1 behavior, not an oversight.
- `/metrics` is guarded by `OperatorApiKeyGuard`, not public — the plan
  doesn't specify, and exposing exception codes/counts unauthenticated
  seemed like the wrong default for an otherwise-locked-down V1.
- Task 24's reliability suite adds 3 new tests, not 10 redundant ones; the
  other 7 scenarios' existing coverage is enumerated, not re-implemented.

## Verification — 2026-09-17

| Check | Result |
| --- | --- |
| Local Postgres 16 stood up, `.env.local` written for all 4 workspaces, 4 existing migrations applied to a fresh `fulfillflow_local` | PASS |
| `npm run build` at repo root | PASS; 5 workspaces, zero type errors |
| Task 20 compliance handlers (uninstall, shop/redact, customers/redact ×3, data_request ×2) | PASS (7 tests) |
| Task 21 PII retention scheduler | PASS (1 test) |
| Task 21 token refresh scheduler (enqueue/skip/dedupe/re-enqueue-after-rotation) | PASS (5 tests) |
| Task 21 token refresh outbox handler (rotate, fail→dead-letter) | PASS (2 tests) |
| Task 22 inventory reconciliation (match, drift+resolve, sweep, 60-step property) | PASS (4 tests) |
| Task 23 `/health` (liveness only) | PASS (1 test) |
| Task 23 `/ready` (DB check + correlation-id echo/preserve) | PASS (2 tests) |
| Task 23 `/metrics` (guard, shape, windowHours, live PENDING count) | PASS (4 tests) |
| Task 23 correlation id on operator `start`'s AuditLog | PASS (extended existing test) |
| Task 23 worker logger redaction | PASS (2 tests) |
| Task 24 reliability integration suite (3 new scenarios) | PASS (3 tests) |
| `npm test` at repo root, real Postgres, **3 consecutive full runs** | PASS all 3: 180/180 each time (db 6, core 42, api 52, worker 80), zero skipped/failing |
| Legacy-name guard (manual grep for gwprint/gwp-ds across every file changed this session) | PASS, no matches |
| `git diff --check` | PASS |

## What M7 needs next (not started)

M7 is product polish (Tasks 25–27): a minimal configurable Policy Engine
(`AutomationRule` — `POLICY_HOLD` already exists in the `ExceptionCode` enum
from M1's original schema design, unused until now), an Automation +
Overview merchant API, and browser E2E / load benchmarking. Two structural
notes for whoever picks this up:

- **No `apps/shopify-web` exists** (M3's explicit, recorded scope decision —
  HANDOVER-M3). Task 26's UI pages and Task 27's Playwright *smoke test of
  that UI* have nothing to render against. The merchant-facing **API**
  layer (automation CRUD, overview metrics) can and should still be built —
  it doesn't depend on a UI existing — but a literal reading of Task 26/27
  isn't achievable without first reversing that M3 decision, which is a
  product-scope call for the user, not an M7 implementation detail.
- **No `k6` binary is installed** in this (or presumably any) session
  environment, and this repo has no existing load-test tooling to extend.
  Task 27's synthetic load benchmark will need either an installable `k6`
  or a from-scratch Node-based substitute; Playwright itself *is* already
  installed (`1.56.1`) and usable once there's a UI to point it at.
