# M7 handover — product polish: Policy Engine, merchant APIs, load benchmarks (Tasks 25–27)

**Status: Tasks 25–27 complete and verified. Gate M7 passes: 3 consecutive
full-root `npm test` runs, 201/201 every time (db 6, core 52, api 61, worker
82).** Built on `ff/m5-shopify-sync-back` (M6 complete, HANDOVER-M6). No M8
work, PR, or deployment was performed. Continued on the same branch as M2–M6,
per the same reasoning HANDOVER-M6 already recorded.

## Plan source and scope

`docs/superpowers/specs/2026-09-14-fulfillflow-complete-implementation-plan.md`,
M7 section (Tasks 25–27) and Gate M7. Two structural gaps flagged in
HANDOVER-M6's "What M7 needs next" both mattered here:

- **No `apps/shopify-web` exists** (M3's explicit, recorded scope decision —
  HANDOVER-M3). Built the merchant-facing **API** layer for Tasks 25/26 in
  full — it doesn't depend on a UI — but Task 26's UI pages and Task 27's
  literal "Playwright smoke test of the embedded app" have nothing to
  render against. Reversing that M3 decision is a product-scope call for
  the user, not something to do implicitly inside an M7 task.
- **No `k6` binary** in this environment, and no existing load-test tooling
  in the repo. Built small Node-based substitutes instead (below).

## What was built

### Task 25 — Policy Engine (`libs/core/src/policy/policy-engine.ts`)

`AutomationRule` (organizationId, enabled, priority, trigger, `conditions`
Json, action) with a new migration — `POLICY_HOLD` had sat unused in the
`ExceptionCode` enum since M1's original schema design, exactly anticipating
this. `conditions`/`action`/`trigger` are Zod-validated in application code,
not the DB schema, so a new condition shape never needs a migration.
Supported conditions: `countryCode`/`channelFinancialStatus`/`containsSku`
(all `in` against a value list) and `totalItemQuantity`
(`>`/`>=`/`<`/`<=`). `evaluateRules` is pure and unit-tested standalone;
`evaluateOrderPolicy` wraps it with the actual query (enabled rules,
`trigger = ORDER_RECEIVED`, ordered by priority). First `HOLD`-action rule
whose conditions all match wins; a matching `ALLOW` rule is a documented
no-op (ALLOW is already the default, so it can't suppress a later `HOLD`) —
the plan doesn't specify this, recorded as a judgment call.

Wired into `createNormalizedOrder` (shared by `orders/create` and
`orders/updated`): evaluated in the same transaction right after the Order
is created. A `HOLD` opens one merchant `POLICY_HOLD` exception and makes
the function return `undefined` instead of `{orderId}` — reusing the exact
signal `withOrderRecord`'s callers already use to skip `routeAndReserve`
for a duplicate/HELD record, so "order created but not routed" falls out of
the existing control flow with no change to either ingestion handler's own
routing call site. `containsSku` matches `OrderItem.externalSku` (the
channel's own SKU string, already captured at ingestion), not the internal
`InventoryItem` code — what a merchant configuring a rule would recognize.

**Architecture note:** the plan's own file path
(`apps/worker/src/core/policy/policy-engine.ts`) doesn't fit once Task 26
needs the exact same `RuleConditionsSchema`/`RuleActionSchema` to validate a
rule's JSON before persisting it from `apps/api`, which cannot import from
`apps/worker` — the same boundary M4 already hit for routing/inventory
(HANDOVER-M4). Moved to `@fulfillflow/core` in a separate small commit
before Task 26 started, no logic change (only the test file's relative
import needed `.js` → `.ts`, `libs/core`'s `--experimental-strip-types`
convention vs `apps/worker`'s `@swc-node/register` one — the exact gotcha
HANDOVER-M4 already documented for this same kind of move).

### Task 26 — merchant automation-rule CRUD + overview (`apps/api/src/merchant/`)

The **first** merchant-facing HTTP surface in this codebase — M3 explicitly
descoped the merchant Orders/SKU-mapping API (HANDOVER-M3), so there was no
sibling controller to copy, but M2's `ShopifyTenantGuard`/`CurrentTenant`/
`TenantContext` were already built exactly for this and had only ever been
exercised by `GET /app/session`.

`/app/automation-rules` (GET/POST/PATCH `:id`/DELETE `:id`): tenant-scoped
via `TenantContext.organizationId` only, never a request body/query id, per
CLAUDE.md's tenant-boundary rule — a `PATCH`/`DELETE` on another org's rule
404s (row-lookup-scoped-to-org, not a generic "not found vs forbidden"
leak). Every write is audited with before/after.

`/app/overview?window=24h|7d` (default 24h): `ordersReceived`,
`straightThroughOrders` (never had any exception) / `straightThroughRate`,
`needsAttention` (currently has an OPEN merchant exception) /
`manualTouchRate`, and `shopifySyncSuccessRate` (`DELIVERED` / total
`shopify.fulfillment.create` `DeliveryAttempt`s in the window — `null`, not
0 or 1, when none were attempted, since neither number would be a real
measurement). A `definitions` field documents each metric in place of the
UI tooltips the plan calls for, since there is no UI to put a tooltip in.

### Task 27 (adapted) — synthetic load benchmarks (`apps/api/scripts/`, `apps/worker/scripts/`, `docs/benchmarks/`)

No k6, no existing load-test tooling — see `docs/benchmarks/benchmark-method.md`
for the full method and a harness gotcha worth reading before reusing this
pattern (supertest against a never-`.listen()`'d app produces spurious
`ECONNRESET`s under real concurrency; an explicit listener has to be
explicitly closed or the test process hangs after its assertions pass).
Two scripts, both driving the real production code paths (not mocks):

- `benchmark-webhook-intake.ts`: 500 concurrent `POST /webhooks/shopify`
  requests, 10% deliberately-duplicate webhook ids. **357 req/s, 0% error
  rate, p50 48ms/p95 77ms/p99 203ms.**
- `benchmark-order-processing.ts`: 300 synthetic orders through the real
  `IngestionLoop`. **71.6 orders/s, 300/300 ACCEPTED.**

**A real bug, found by the first benchmark and fixed, not just measured
around:** `WebhooksController`'s `ingestionRecord.upsert()` is not atomic
against a *genuinely* concurrent duplicate delivery of the same webhook id
(something Shopify's own retry behavior can produce) — Prisma 7's
`upsert()` surfaced the race as either `P2002` (unique violation) or
`P2025` ("no record found for an upsert"), depending on timing. The
existing test suite never caught this because its only duplicate-delivery
test sent deliveries *sequentially*, which every clean upsert handles
fine. Fixed: on either race error, re-read the row by `dedupeKey` (the
winner's insert already committed) and use it, rather than surfacing a
500. Regression-tested (10 genuinely concurrent requests, a real listening
server, asserting they all resolve to the same `ingestionRecordId`) and
re-validated by the 0%-error benchmark run recorded above — full write-up,
including why the original ~28% "error rate" was largely a red herring from
the harness itself layered on top of this one real bug, in
`benchmark-method.md`.

Numbers recorded honestly per the plan's own instruction: one shared local
machine, one process, no claim of production scale — see `docs/benchmarks/latest.md`.

## Infra note carried over from M6/inherited here

`npx turbo run build --force` was needed twice more this session (after the
`AutomationRule` migration, and after moving `policy-engine.ts`) — turbo's
build cache doesn't reliably invalidate on a Prisma client regeneration or
a cross-package file move, matching what HANDOVER-M6 already flagged.
Documented once there; not re-explaining per occurrence.

## Judgment calls and limits (summary — full rationale inline above)

- `evaluateRules`: a matching `ALLOW` rule never suppresses a later `HOLD`
  (undocumented by the plan).
- `containsSku` matches the channel SKU string, not the internal item code.
- Policy engine lives in `@fulfillflow/core`, not `apps/worker`, so
  `apps/api` can validate a rule's JSON with the same schema it's evaluated
  against later.
- Merchant API built without a UI, since M3 already decided not to build
  one; Task 26's UI-specific asks (tooltips) are satisfied via a
  `definitions` field in the API response instead.
- `shopifySyncSuccessRate` is `null`, not 0 or 1, when no sync attempts
  exist in the window.
- Load benchmarks are Node scripts, not k6, given no k6 binary exists in
  this environment; both drive real production code paths, not mocks.
- The webhook-intake race fix re-reads by `dedupeKey` on *any*
  `PrismaClientKnownRequestError` (not narrowly P2002), because this
  session observed Prisma surface the same underlying race as two
  different error codes depending on timing.

## Verification — 2026-09-17

| Check | Result |
| --- | --- |
| `npm run build` (forced, twice, after schema/move changes) | PASS; 5 workspaces, zero type errors |
| Task 25 policy-engine unit tests (rule matching, priority, comparators, malformed input) | PASS (10 tests) |
| Task 25 order-acceptance integration (HOLD blocks routing, disabled HOLD doesn't) | PASS (2 tests) |
| Task 26 automation-rule CRUD (create/list/update/delete, audit, validation, cross-tenant 404) | PASS (4 tests) |
| Task 26 overview (auth, real ratios from seeded data, window param, tenant isolation) | PASS (4 tests) |
| Task 27 webhook-intake benchmark | PASS, 0% error rate (500 req, 357 req/s) |
| Task 27 order-processing benchmark | PASS, 300/300 ACCEPTED (71.6 orders/s) |
| Webhook concurrency regression test (10 genuinely concurrent duplicate deliveries) | PASS, stable across 5 consecutive runs |
| `npm test` at repo root, real Postgres, **3 consecutive full runs** | PASS all 3: 201/201 each time (db 6, core 52, api 61, worker 82), zero skipped/failing |
| Legacy-name guard (manual grep for gwprint/gwp-ds across every file changed this session) | PASS, no matches |
| `git diff --check` | PASS |

## What M8 needs next (not started)

M8 is deployment, security pass, documentation, demo, CV package, main
cutover (Tasks 28–32). Two of its tasks are genuinely blocked, not just
undone:

- **Task 28** (separate Railway FulfillFlow project) needs real Railway
  credentials/project creation — an external, costly, human-authorized
  action this session cannot and should not take unilaterally.
- **Task 32** (final verification + cutover to `main`) needs a real
  Shopify dev store closed-loop run — Task 19/Gate M5's Human Setup Gate
  H0, still open per HANDOVER-M5, unchanged since.

The rest of M8 — Task 29 (security/data-handling docs), Task 30 (ADRs +
README case study — ADR-01 through ADR-06 were never actually written
despite M2's Task 1 calling for ADR-01/02; only ADR-07/08 exist today),
and Task 31 (demo script + CV bullets, honestly scoped given Task 19 never
ran) — doesn't depend on either blocker and can proceed.
