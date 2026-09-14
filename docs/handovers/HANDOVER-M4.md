# M4 handover — routing, inventory, fulfillment lifecycle, shipment (Tasks 13–16)

**Status: Tasks 13–16 complete and verified. Gate M4 passes as an automated
test.** Built on `ff/m3-order-ingestion` (M3 complete, HANDOVER-M3). No M5
work, PR, or deployment was performed.

## Plan source and scope

`docs/superpowers/specs/2026-09-14-fulfillflow-complete-implementation-plan.md`,
M4 section (Tasks 13–16) and Gate M4. M3's narrower scope (Tasks 10–12
excluded — no merchant Orders/SKU-mapping API or `apps/shopify-web`) carries
forward unchanged; M4 doesn't touch that surface either.

## Architectural change: `@fulfillflow/core`

The plan's own file layout put Task 13/14's routing and inventory services
under `apps/worker/src/core/**`, but Task 15/16's operator HTTP commands
belong in `apps/api` per `CLAUDE.md`'s architecture ("apps/api → …
merchant/operator HTTP API"). `apps/worker` is a headless NestJS application
context, not an importable library the way `@fulfillflow/db` is, so
`apps/api` had no way to call the exact same reservation/routing logic
`apps/worker`'s ingestion handlers use.

Fix: moved `routing.service.ts`, `inventory-ledger.service.ts`,
`inventory-reservation.service.ts`, and the shared exception-opener into a
new workspace package, `libs/core` (`@fulfillflow/core`) — built like
`@fulfillflow/db` (tsc → `dist/`, Prisma-dependent, server-only, **not**
the isomorphic `@fulfillflow/shared`). Both `apps/api` and `apps/worker` now
depend on it. This is a normal `npm install` away from working; nothing
about the M1–M3 architecture changed otherwise. See ADR note in
`libs/core/src/index.ts`'s doc comment.

One consequence: relative imports inside `libs/core` use `.ts` specifiers
(matching `libs/db`'s own `--experimental-strip-types` test runner
convention, not `apps/api`/`apps/worker`'s `@swc-node/register` `.js`
convention) — this tripped module resolution once and is fixed. That same
runner also rejects TypeScript constructor parameter properties
(`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`); `InsufficientStockError` and
`MissingBomError` use plain field assignment instead.

**Latent bug found and fixed along the way:** `apps/api`'s `test` script had
the same unquoted `src/**/*.test.ts` glob bug M3 already found and fixed for
`apps/worker` — Git Bash only expands `**` one directory deep, so the new
`src/operator/fulfillments/*.test.ts` (two levels deep) silently never ran
until the glob was quoted. Every API test file before this session happened
to live exactly one level deep, so nothing had exposed it. Fixed for
`apps/api` and (defensively) `libs/core`.

## What was built

### Task 13 — routing (`libs/core/src/routing/`)

`routeOrder(orderId)`: one order → one facility. A facility is eligible only
if `ACTIVE` and has an `enabled` `FacilitySkuCapability` for every distinct
SKU on the order. Scoring for a multi-SKU order uses the facility's weakest
link across its lines (lowest `priority`, longest `leadTimeHours` — a
documented judgment call, since the schema doesn't dictate how per-SKU
scores aggregate to a per-order score), tie-broken by `facility.code`.
Selected → `RoutingDecision(SELECTED)` + one `Fulfillment(ORIGINAL, QUEUED)`
+ one `FulfillmentItem` per `OrderItem`. No candidate → `RoutingDecision
(NO_ROUTE)` + one INTERNAL `NO_ELIGIBLE_FACILITY` exception, **no**
Fulfillment. Full rationale in `docs/adr/ADR-08-v1-single-facility-routing.md`.

### Task 14 — inventory (`libs/core/src/inventory/`)

`reserveFulfillment(fulfillmentId)` expands each `FulfillmentItem` into its
component demand — the SKU's own `InventoryItem` for `FROM_STOCK`; the
active `BomRevision`'s components (× quantity × `1+wastageRate`) for
`MADE_TO_ORDER` — and reserves each atomically via one guarded SQL
`UPDATE … WHERE (onHand - reserved) >= qty` per component
(`inventory-ledger.service.ts`), so concurrent reservations against the same
balance row serialize on Postgres's row lock rather than racing in
application code (verified: 20 concurrent qty=1 reservations against
stock=10 → exactly 10 succeed). A shortfall rolls back the whole attempt (no
partial reservation), blocks the `Fulfillment`, and opens one INTERNAL
`INSUFFICIENT_STOCK` (or `PRODUCTION_BLOCKED` for a missing BOM) exception —
never throws out to the caller. Idempotent per (fulfillmentItem,
inventoryItem): a retry only reserves what's still missing.
`releaseFulfillment`/`consumeForProduction`/`consumeForShipment` mirror the
guarded-update, idempotency-keyed-movement pattern M3's cancellation handler
already established (`reserve:<id>`, `release:<id>`, `consume:<id>[:cumulative]`).
`consumeForShipment` is split into a tx-scoped `consumeForShipmentTx` plus a
thin wrapper, because Task 16 needs to run it inside shipFulfillment's own
transaction and Prisma has no nested transactions.

**Wiring (Task 13 Step 4):** `withOrderRecord`/`createNormalizedOrder` now
return the new Order's id only on a genuine accept (fresh `orders/create`,
or a HELD order recovered by `orders/updated`), so
`processOrdersCreate`/`processOrdersUpdated` call `routeAndReserve(orderId)`
once, after that transaction commits. Since M3's ingestion tests have no
facility fixtures, every order they accept now also produces a real
`NO_ROUTE` decision and one INTERNAL exception — correctly, there's nowhere
to route it. Fixed the M3 assertions that counted *all* exceptions per order
to scope to `visibility: MERCHANT` (what those tests actually verify), and
taught `order-test-support.ts`'s cleanup to remove the
`RoutingDecision`/`Fulfillment` rows a routed order now leaves behind.

### Task 15 — operator fulfillment commands (`apps/api/src/operator/fulfillments/`)

`POST /operator/fulfillments/:id/start`: `QUEUED` + ≥1 `ACTIVE` reservation
→ `IN_PRODUCTION`. `POST …/complete-production`: `IN_PRODUCTION` →
`READY_TO_SHIP`, consuming every MTO component reservation via
`consumeForProduction` and setting every `FulfillmentItem.producedQuantity`
to its ordered quantity (V1 has no partial-production concept). Both are
409, no mutation, on an invalid transition; both write an `AuditLog`.
`OperatorApiKeyGuard` requires `OPERATOR_API_KEY` to be configured **in
every environment** (not just production) — unset means the whole
`/operator/**` surface is always 401, a stricter reading of the plan's
"disable in production unless configured" chosen because there's no other
signal in this codebase distinguishing "local dev" from "someone forgot to
set it."

### Task 16 — manual shipment (`apps/api/src/operator/shipments/`)

`POST /operator/fulfillments/:id/ship`, one transaction: rejects a
missing/`INVALID`/`UNVERIFIED` address; validates cumulative shipped
quantity per `FulfillmentItem` never exceeds its ordered quantity across
partial shipments; creates `Shipment` (`IN_TRANSIT`) + `ShipmentItem`s with
an address snapshot; consumes the `FROM_STOCK` reservation quantities this
shipment covers via `consumeForShipmentTx`; moves the `Fulfillment` to
`SHIPPED` (every item fully shipped) or `PARTIALLY_SHIPPED`; inserts exactly
one `PENDING` `OutboxEvent` (`handler: shopify.fulfillment.plan`,
`eventKey: shipment.sync-plan:{shipmentId}`, payload `{shipmentId}` only —
planning only, the real Shopify mutation is a separate outbox row in M5). A
duplicate `(provider, trackingNumber)` rolls back the whole transaction via
the DB's own unique constraint (mapped to a clean 409); no partial
inventory/outbox write is possible because everything is one transaction.

## Judgment calls and limits

- Multi-SKU routing score aggregation (weakest-link) is not specified by the
  plan; documented in ADR-08 rather than left implicit.
- `reserveFulfillment`/routing never roll back or retry the canonical Order
  on failure — they settle as an internal exception on the Fulfillment, per
  the plan's explicit instruction for Task 13 Step 4.
- `completeProduction` calls `consumeForProduction` as a separate step
  *before* its own guarded status-transition transaction (not one atomic
  transaction like `shipFulfillment`) — the plan's Task 15 doesn't use the
  "same transaction" language Task 16 does for shipment, and
  `consumeForProduction` is already idempotent, so a crash between the two
  steps is safe to retry rather than needing the same tx-scoped-core
  treatment `consumeForShipmentTx` got.
- V1 has no partial-production concept: `complete-production` always sets
  `producedQuantity = quantity` for every item on the fulfillment.
- `OperatorApiKeyGuard`'s "always require the key, even outside production"
  reading is stricter than a literal parse of the plan's sentence; flagged
  above as a judgment call.
- No new Prisma migration was needed — every M4 model (`RoutingDecision`,
  `Fulfillment`, `FulfillmentItem`, `InventoryReservation`,
  `InventoryBalance`, `InventoryMovement`, `BomRevision`, `BomComponent`,
  `Shipment`, `ShipmentItem`, `OutboxEvent`) already existed from M1's V2.1
  schema.

## Verification — 2026-09-14

| Check | Result |
| --- | --- |
| `npm run build` at repo root | PASS; 5 workspaces (added `@fulfillflow/core`), zero type errors |
| `npm test` at repo root, real Postgres | PASS: 122/122 (db 5, core 17, api 63, worker 37), zero skipped/failing |
| Routing: eligibility/scoring/tie-break/no-route | PASS (8 tests) |
| Inventory: FROM_STOCK, MTO+wastage, 20-concurrent, idempotent reserve/release, insufficient-stock, missing-BOM, consume-for-production, consume-for-shipment (partial) | PASS (9 tests) |
| Operator start/complete-production: happy path, no-reservation, wrong-status, AuditLog | PASS (7 tests) |
| Operator ship: address guard, over-quantity guard, partial→full, duplicate tracking, unknown item, wrong status | PASS (9 tests) |
| Gate M4 automated equivalent (route → reserve → start → complete-production → ship) | PASS: reserved returns to 0, onHand drops by exactly the shipped quantity, one PENDING `shopify.fulfillment.plan` outbox event |
| M3 regression (ingestion tests updated for routing side effects) | PASS, no behavior change to M3's own guarantees |

Local Postgres is `fulfillflow_local` in the `gwprint-pg` container (shared
with legacy GWPrintz, per `libs/db/.env.local` — untouched). One batch of
test debris (a handful of orphaned rows from an earlier, since-fixed test
helper bug, plus one pre-existing leftover from an unrelated M3 test file)
was found and manually cleaned from the local dev DB during this session;
none of it was committed or affects CI, which runs against a fresh database
per `docs/adr` M1 CI setup.

## What M5 needs next (not started)

M5 is Shopify `FulfillmentOrder` resolve + closed-loop tracking sync (Tasks
17–19): resolving Shopify's `FulfillmentOrder`/line-item ids for a canonical
Order, and turning the `shopify.fulfillment.plan` outbox event this session
introduces into a real `shopify.fulfillment.create` GraphQL mutation (one
child outbox row per assigned location, per the plan's Task 18). Nothing in
M4 emits that child event yet — `shipFulfillment` only creates the planning
row; a worker-side handler for `shopify.fulfillment.plan` doesn't exist
until M5. Shopify Admin API GraphQL client work from M2
(`shopify-graphql.client.ts`) is unused so far and is exactly what M5 needs.
