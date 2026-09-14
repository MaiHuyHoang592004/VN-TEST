# M5 handover — Shopify FulfillmentOrder resolve + closed-loop tracking sync (Tasks 17–19)

**Status: Tasks 17–18 complete and verified by automated tests, including a
credential-free M5 acceptance gate. Task 19's live dev-store run is NOT
done — Human Setup Gate H0 (a real Shopify dev store + API credentials)
was never completed for this repo, and completing it is an external action
outside this session's scope.** Built on `fulfillflow-v2`, which itself was
created this session by pointing at the tip of `ff/m3-order-ingestion` (M1–M4
already chained there linearly — no merge was needed). Work lives on
`ff/m5-shopify-sync-back`. No PR opened, no merge to `main` or
`fulfillflow-v2`.

## Plan source and scope

`docs/superpowers/specs/2026-09-14-fulfillflow-complete-implementation-plan.md`,
M5 section (Tasks 17–19) and Gate M5. The plan's own referenced
`2026-09-11-shopify-connect-design.md` does not exist in this repo and never
has — HANDOVER-M2 already recorded that it lived outside the repo and M2
was corrected against the recovered `2026-09-14` plan instead. M5 uses that
same `2026-09-14` plan as its only spec.

**Branch topology correction:** the plan's own "Execution topology" section
describes cutting a `fulfillflow-v2` integration branch from `ff/m1-foundation`
before M2 started, with each milestone branching from and PRing back into
it. That never happened — M2/M3/M4 chained directly on top of each other
(`ff/m1-foundation` → `ff/m2-shopify-review` → `ff/m3-order-ingestion`, per
HANDOVER-M2/M3/M4). Per the user's explicit choice this session, `fulfillflow-v2`
was created now, pointed at `ff/m3-order-ingestion`'s tip (a fast-forward,
not a merge, since that tip already **is** M1+M2+M3+M4 linearly) and pushed;
`ff/m5-shopify-sync-back` branches from it as the plan describes for every
milestone after this one.

## Architectural changes

### `token-crypto.ts` / `shopify-auth.client.ts` / `token-manager.ts` moved into `libs/core`

Same problem M4 hit with routing/inventory: Task 18's `shopify.fulfillment.create`
handler runs in `apps/worker`, which needs to decrypt a `Store`'s access
token exactly like `apps/api` does, but `apps/worker` cannot import
`apps/api/src/**`. Moved all three (previously `apps/api/src/shopify/*`,
now `libs/core/src/shopify/*`) alongside their tests; `apps/api`'s own
consumers (`shopify.module.ts`, `session.controller.ts`, `store-bootstrap.ts`)
now import them from `@fulfillflow/core`. `ShopifyTokenManager`'s constructor
had to lose its TypeScript parameter-property shorthand — `libs/core`'s test
runner (`node --experimental-strip-types`) rejects that syntax, the same
limitation HANDOVER-M4 already documented for `InsufficientStockError`.

### New: `libs/core/src/shopify/shopify-graphql.client.ts`

HANDOVER-M4 claimed a `shopify-graphql.client.ts` already existed from M2
and was "unused so far." **That file never existed anywhere in the repo** —
M2 only built the REST-shaped token-exchange/refresh client
(`shopify-auth.client.ts`). This session wrote the GraphQL Admin API client
from scratch: `shopifyGraphql<T>(shop, accessToken, query, variables)`
classifies transport/protocol failures for the outbox loop — network
errors and HTTP 429/5xx are `ShopifyRetryableError` carrying a
`Retry-After`-derived delay when the header is present; a GraphQL-level
`errors[].extensions.code === "THROTTLED"` response (the Admin API's
cost-based leaky-bucket limiter, which has **no** `Retry-After` header —
verified against current `shopify.dev` docs this session) computes a delay
from `extensions.cost.throttleStatus`, falling back to Shopify's documented
1-second minimum backoff when cost data is absent. A mutation's own
`userErrors` are deliberately *not* this client's concern — the caller
inspects `data` and decides.

### New: `RetryableOutboxError` / `BusinessOutboxError` (`apps/worker/src/queue/outbox-errors.ts`)

`OutboxLoop` previously had one uniform failure path (always retry with
exponential backoff up to `maxAttempts`), unlike `IngestionLoop`, which
already distinguishes retryable vs. terminal via `BusinessIngestionError`.
Task 18 needs the same distinction (`userErrors` → dead-letter now;
429/5xx/throttle → retry, honoring a specific delay) plus a delay override
mechanism ingestion never needed. Added the mirror-image error pair and
taught `OutboxLoop.tick()` and `failOutbox` (`libs/db/src/queue.ts`, now
takes an optional `retryAfterSeconds`) to honor both. Kept `apps/worker`'s
generic queue layer free of any Shopify-specific import — the create
handler is the only place that translates `ShopifyRetryableError` into
`RetryableOutboxError`.

### Pre-existing gap fixed: `apps/worker` never loaded its own `.env.local`

Every other workspace (`db`, `core`, `api`) sources `.env.local` in its test
script; `apps/worker`'s never did. It worked by accident as long as
`DATABASE_URL` happened to already be exported in whatever shell ran it
previously. In this session's shell it wasn't, and `apps/worker`'s Prisma
client hung indefinitely trying to connect with an empty connection string
instead of failing loudly (root `npm test` showed 34/38 worker tests failing
with a misleading Prisma `P1010`-shaped error, and a plain
`cd apps/worker && npm test` in a bare shell hung until killed). M5 also
needs `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET`/`SHOPIFY_TOKEN_ENC_KEY` in the
worker process for the first time, so this could no longer be deferred.
Fixed the script and added `apps/worker/.env.local` (gitignored, dev-only
dummy values mirroring `apps/api/.env.local`) plus `apps/worker/src/config/env.ts`.

## What was built

### Task 17 — resolver (`apps/worker/src/channels/shopify/fulfillment/`)

`resolveForOrder(orderId, { force? }, deps?)`: loads the Order + its
OrderItems, and — unless `force` or the cache is incomplete for this
order's items — returns the existing `ShopifyFulfillmentOrderLine` cache
rows without touching the network. On a miss/force, calls the GraphQL
Admin API (query in `shopify-fulfillment-order-resolver.ts`) for the
order's `FulfillmentOrder`s, upserts each returned line keyed by Shopify's
own `fulfillmentOrderLineItemId`, mapping back to `OrderItem` via
`externalLineId`. An empty FulfillmentOrder list throws
`FulfillmentOrderNotReadyError` (Shopify hasn't finished routing yet —
retryable by construction, since it isn't a `BusinessIngestionError`/
`BusinessOutboxError`). A `FulfillmentOrder` assigned to a location whose
Shopify `Location.fulfillmentService` is non-null (third-party, not
merchant-managed) opens one merchant-visible `CHANNEL_SYNC_FAILED` keyed
to `order:<id>` instead of being cached/fulfilled — idempotent, same
partial-unique-index guard every other exception path uses. `deps` accepts
an injectable `queryFulfillmentOrders`/`tokenManager` purely for test
isolation; production code never passes them (defaults to the real
`shopifyTokenManager` singleton and `shopifyGraphql`).

`fulfillment_orders/order_routing_complete` (`fulfillment-order-routing-complete.handler.ts`,
registered in `worker.module.ts`'s `IngestionHandlerRegistry`): maps the
webhook's numeric `order_id` to `gid://shopify/Order/<id>`, looks up the
canonical Order, and calls `resolveForOrder(order.id, { force: true })`.
No canonical Order yet is a plain `Error` (retryable — most likely
`orders/create` hasn't been processed yet); nothing else about ingestion
settlement changes, since `IngestionLoop.tick()` already marks a
successfully-handled record `ACCEPTED` on its own.

### Task 18 — plan/create (same directory)

**Judgment call:** the plan's Task 18 Step 8 says the planner "does not call
external" and creates no `DeliveryAttempt` because it makes no external
request — but Task 17 Step 5 describes cache misses as something *any*
caller of `resolveForOrder` lazily resolves. Those two statements conflict
for the planner specifically. Resolved by making `shopify.fulfillment.plan`
**strictly cache-only**: it reads `ShopifyFulfillmentOrderLine` directly and
throws a plain retryable `Error` if any `ShipmentItem`'s line isn't cached
(or has a null `assignedLocationId`), rather than ever calling
`resolveForOrder` itself. In practice the cache is populated by the
`fulfillment_orders/order_routing_complete` handler above; the planner just
waits (with the outbox loop's normal backoff) until it is.

`planShopifyFulfillment`: loads the Shipment's items, resolves each via the
cache, and — if every allocated quantity fits the cached
`remainingQuantity` — groups allocations by `assignedLocationId` and, in
one transaction, creates one child `shopify.fulfillment.create` OutboxEvent
per group (`eventKey: shipment.sync:{shipmentId}:{assignedLocationId}`) and
marks its own event `SENT`. A quantity that no longer fits (most likely a
manual Shopify-admin fulfillment) opens one merchant `CHANNEL_SYNC_FAILED`
keyed to `shipment:<id>` instead, with no child event.

`createShopifyFulfillment`: sends exactly one `fulfillmentCreate` mutation
per event (all allocations, grouped by `fulfillmentOrderId`, plus
`trackingInfo`/`notifyCustomer: true`), writing exactly one `DeliveryAttempt`
for the HTTP attempt regardless of outcome. `userErrors` → one merchant
`CHANNEL_SYNC_FAILED` + `BusinessOutboxError` (immediate dead-letter, no
retry — Shopify already told us definitively this won't succeed).
`ShopifyRetryableError` → `RetryableOutboxError`, carrying Shopify's own
delay when it gave one. On success, the returned `Fulfillment` gid is
saved to `Shipment.externalFulfillmentId` (only if not already set) and
every allocation's cached `remainingQuantity` is decremented, all in one
transaction. If `externalFulfillmentId` is already set and this shipment
has exactly one `shopify.fulfillment.create` event total, the handler
returns immediately without a second mutation or a second `DeliveryAttempt` —
V1 demo data is always single-location, so this is the only case that
matters yet; a genuine future multi-group shipment needs each group's own
mutation regardless of a sibling's state, which is why the check is "how
many create-events does this shipment have," not "does one exist."

Both handlers are registered in `apps/worker/src/worker.module.ts`'s
`HandlerRegistry` (the outbox one — separate from the ingestion registry
Task 17's handler uses).

### Task 19 — closed loop

`docs/demo/closed-loop-checklist.md`: the manual, credential-gated steps
for the real dev-store run, explicit that it has not been performed here
and about what "Gate H0" still requires. `scripts/demo/create-demo-shipment.ts`:
given an order's Shopify display number, looks up its (already routed and
reserved) Fulfillment directly via `@fulfillflow/db` — read-only, there is
no merchant Orders API in this build to ask instead — then drives
start → complete-production → ship through the real `/operator/fulfillments`
HTTP API with synthetic tracking, so the live demo doesn't need three
typed curl commands. Root `package.json` gained `"type": "module"` (it had
no `type` field at all, which made a plain root-level `.ts` script emit a
Node `MODULE_TYPELESS_PACKAGE_JSON` warning; every workspace already sets
its own `type` independently, so this only affects files with no closer
`package.json`, i.e. `scripts/**`).

**What substitutes for the live run in this session:** `m5-acceptance.e2e.test.ts`
drives `resolveForOrder` → the real `OutboxLoop.tick()` twice (plan, then
create) against a fake Shopify GraphQL server, asserting the same two
externally-visible effects the checklist's step 7 would read from the
Shopify admin: `Shipment.externalFulfillmentId` set to the returned gid,
and the cached `remainingQuantity` decremented to zero. This is the
worker-side equivalent of HANDOVER-M4's own operator-HTTP acceptance gate —
not a replacement for actually running against a real store, which Task 19
still requires.

## Judgment calls and limits

- Planner is cache-only by design (see Task 18 above) — a documented
  reading of a spec conflict, not an oversight.
- `CHANNEL_SYNC_FAILED` for an unsupported location is keyed to
  `order:<id>` (Task 17); for a quantity mismatch or `userErrors` it's
  keyed to `shipment:<id>` (Task 18) — matching each condition to the
  entity it's actually about, consistent with every other exception's
  `subjectKey` convention in this codebase.
- The create handler's idempotency check counts this shipment's total
  `shopify.fulfillment.create` events rather than checking a boolean —
  see the multi-group rationale above.
- No new migration was needed beyond Task 17's `assignedLocationId` column;
  Task 18 only added rows to `OutboxEvent`/`DeliveryAttempt`, which already
  existed.
- `scripts/demo/create-demo-shipment.ts` assumes exactly one `Fulfillment`
  per Order (true for V1's single-facility routing) and refuses otherwise
  rather than guessing.

## Verification — 2026-09-14/15

| Check | Result |
| --- | --- |
| `npm run build` at repo root | PASS; 5 workspaces (`@fulfillflow/core` gained `shopify/*`), zero type errors |
| `npm test` at repo root, real Postgres, **3 consecutive runs** | PASS all 3: 150/150 each time (db 6, core 42, api 46, worker 56), zero skipped/failing |
| `libs/core` Shopify move (token-crypto/auth-client/token-manager + new graphql client) | PASS (42 tests, includes 9 new graphql-client tests) |
| Task 17 resolver: cache hit/miss/force, empty-result retryable, unsupported-location exception (+ idempotent repeat) | PASS (6 tests) |
| Task 17 ingestion handler: invalid payload, missing Order, real end-to-end cache refresh via a monkeypatched `fetch` | PASS (3 tests) |
| Task 18 planner: single-group happy path, unresolved-cache retryable, quantity-mismatch exception | PASS (3 tests) |
| Task 18 create handler: happy path (gid saved, cache decremented, one DeliveryAttempt), userErrors dead-letter, 429 Retry-After, already-synced short-circuit | PASS (4 tests) |
| `OutboxLoop`/`failOutbox` new business/retry-after paths | PASS (2 new worker tests, 1 new db test) |
| M5 acceptance gate (`m5-acceptance.e2e.test.ts`): resolve → real `OutboxLoop.tick()` × 2 (plan, create) against a fake GraphQL server | PASS |
| Legacy-name guard (manual grep for gwprint/gwp-ds across every file changed since `fulfillflow-v2`) | PASS, no matches |
| `git diff --check` | PASS |

Local Postgres is the same shared `fulfillflow_local` dev database prior
sessions used. Two rounds of test debris were found and fixed/cleaned this
session, neither committed:

1. Two orphaned `Sku`/`Product`/`InventoryItem` rows from an earlier version
   of `fulfillment-order-routing-complete.handler.test.ts`'s own fixture,
   before its cleanup hook was fixed to also delete those — caught by
   `seedV2`'s idempotency test (`sku.count() === 6` failing 8≠6).
2. **A real cross-workspace test-isolation bug**, not just leftover rows:
   the two new tests proving `RetryableOutboxError`'s delay override
   (one in `libs/db/src/queue.test.ts`, one in
   `apps/worker/src/queue/outbox-loop.test.ts`) each deliberately leave a
   row `PENDING` with a short (~3–5s) `availableAt` to assert the delay —
   and neither cleaned that row up afterward. Because every workspace's
   tests share one Postgres database and `claimOutbox` has no handler
   filter, by the time a *later* workspace's test ran its own
   `OutboxLoop.tick()` (specifically the new `m5-acceptance.e2e.test.ts`),
   the short delay had already lapsed and the stray row got claimed
   alongside the real one — inflating a `tick()` batch from 1 to 2 and
   failing an assertion **only when run as part of the full `npm test`
   root run, never in isolation**, which made it look like flakiness at
   first. Fixed by deleting each row immediately after its assertion.
   Confirmed fixed with 3 consecutive full-root-suite passes (table above).

## What M6 needs next (not started)

M6 is reliability/compliance/observability (Tasks 20–24): `app/uninstalled`
must dead-letter pending `shopify.fulfillment.plan`/`shopify.fulfillment.create`
events for a Store the same way it dead-letters other pending work (M5
introduced two more handler names that need to be covered by that sweep).
The reliability integration suite (Task 24) explicitly calls for "same
Shipment plan/create path invoked twice → one Shopify fulfillment mutation" —
this session's create-handler unit test and the acceptance gate already
cover that at the handler level; Task 24 should still add it against a
real fake-HTTP-server harness for consistency with M5's other channel
tests. Task 19's live dev-store run is still owed whenever Gate H0 is
completed — nothing in M6 depends on it, but the CV-readiness claim does.
