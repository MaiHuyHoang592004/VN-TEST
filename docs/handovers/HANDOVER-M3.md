# M3 handover — Shopify order ingestion (Tasks 7–9)

**Status: Tasks 7–9 complete and verified. M3 acceptance gate passes.** No M4
work, PR, push, or deployment was performed.

## Addendum — unknown-topic policy resolved (this session)

The prior checkpoint below left one decision open: what happens when
`IngestionLoop` claims a row whose `topic` has no registered handler. Decided
and implemented:

**An unregistered topic settles `EXCEPTION` immediately with
`errorCode: UNKNOWN_TOPIC`, never retried.** Rationale: a missing handler is
a permanent condition — waiting and retrying cannot make one appear, only a
code deploy can. This mirrors the outbox loop's existing precedent for the
exact same situation (`OutboxLoop.tick()`'s "no handler registered" branch
calls `failOutbox` with `maxAttempts: 0`, i.e. immediately terminal).

Implementation (`apps/worker/src/ingestion/ingestion-loop.ts`): the
missing-handler check moved inside the per-record `try`/`catch` and throws a
`BusinessIngestionError("UNKNOWN_TOPIC", ...)`, reusing the same settlement
path `SKU_NOT_MAPPED` and friends already use. Previously the check threw out
of the batch `for` loop entirely, so one unknown-topic row anywhere in a
claimed batch left every row after it unprocessed for that tick (not
permanently stuck — the lease still expires and a later tick reclaims
them — but wasteful and inconsistent with how every other per-row failure is
handled). New test:
`"an unregistered topic settles EXCEPTION immediately with UNKNOWN_TOPIC,
without retrying, and does not block the rest of the batch"` in
`ingestion-loop.test.ts`, asserting both the settlement and that a sibling
row in the same batch is unaffected.

Full verification after the fix: `npm run build` clean (4 workspaces, 0 type
errors), `npm test` **88/88** (API 46, worker 37, DB 5), legacy-name guard
clean. Task 7 is now fully complete per the plan's defined behaviors
(success, retryable, business, shutdown, and this unknown-topic case).

Work is on `ff/m3-order-ingestion` in `C:/VN-TEST`, based on corrected M2 commit
`af7c7c3`. `ff/m1-foundation` remains at `3c1747c`; `ff/m2-shopify-review` remains
at `af7c7c3`. PR #3, the M2 PR, the legacy deployment, and all API source files
were untouched. The pre-existing untracked `apps/dashboard/` was left alone.

## Plan source and scope

Read HANDOVER-M2 first, then Tasks 7–9 and Gate M3 from the recovered
`2026-09-14-fulfillflow-complete-implementation-plan.md` supplied at
`C:/Users/Admin/Downloads/2026-09-14-fulfillflow-complete-implementation-plan.md`.
The schema, existing queue classes, and webhook controller were read before
implementation. The user's narrower scope overrides the plan's broader M3:
Tasks 10–12, including mapping API/UI and merchant Orders UI/API, are excluded.

## Resolved decision — unknown-topic policy (see addendum above)

The plan's Task 7 defines only successful dispatch, retryable failure,
business failure, and AbortSignal shutdown — no unknown-topic step. This was
left open at the end of the original session. **Resolved above**: immediate
`EXCEPTION` / `UNKNOWN_TOPIC`, no retry, settled per-row so it can't stall the
rest of a batch. The ingestion enum has **no DEAD_LETTER status** — this
policy uses `EXCEPTION`, not a new enum value.

## What was built

### Task 7 — worker processing

- `IngestionHandlerRegistry` follows the outbox registry's register/get shape,
  including rejecting duplicate registrations. Dispatch uses persisted `topic`.
- `IngestionLoop` uses the existing `claimIngestion`. Success completes only
  after the handler resolves. `BusinessIngestionError` settles EXCEPTION with
  code/message; retryable/unexpected handler failures use bounded backoff.
- `completeIngestion` and `failIngestion` live in `libs/db/src/queue.ts` and
  clear the lease. Completion/failure only updates PENDING rows, preserving
  the HELD/DUPLICATE/EXCEPTION/ACCEPTED result committed by a business handler.
- `WorkerModule` registers the three Shopify topics and provides INGESTION_LOOP.
  `main.ts` runs it alongside OutboxLoop. IngestionClaimLoop remains for M2's
  tests but is no longer registered or started, so no competing runtime exists.
- Shutdown drains the current batch and interrupts idle polling; the new loop
  removes its abort listener after each wait.

### Task 8 — canonical orders

- Five plan fixtures, a Zod payload schema, a normalizer, and a syntactic
  address completeness validator were added under the worker's Shopify orders
  directory. Canonical order, variant and line identifiers use Shopify GIDs.
  Order properties become customization; mapping defaults supply artwork and
  default customization, with line properties overriding defaults.
- Paid + all lines mapped creates Order, OrderItems, OrderAddress, and the
  ACCEPTED ingestion result in one database transaction.
- An incomplete address still creates the order, with INVALID status and
  machine-readable errors, plus one merchant INVALID_ADDRESS exception.
- Any unmapped line prevents all Order/OrderItem creation, settles EXCEPTION,
  and creates one merchant SKU_NOT_MAPPED keyed to `ingestion:<id>`.
- Anything other than financial status `paid` is HELD without an Order.
- Duplicate deliveries are DUPLICATE with the existing resultOrderId. Existing
  sourceKey and storeId/externalId unique constraints are retained. An advisory
  transaction lock serializes one store/order identity before the Order exists;
  row locks protect existing orders and ingestion records. Store ownership is
  checked from the persisted record; payload tenant fields are never used.

### Task 9 — updates and cancellations

- Updates at or before channelUpdatedAt settle DUPLICATE and leave the entire
  canonical order unchanged. New paid updates can create an Order from HELD;
  matching HELD records in that store/org receive the resulting order ID.
- Changed addresses before any shipment overwrite address fields and become
  UNVERIFIED. If any shipment exists, preserve the address and shipment snapshot
  and open one merchant ADDRESS_CHANGED_AFTER_SHIP with the proposed address.
- QUEUED/BLOCKED fulfillment cancellation releases ACTIVE reservations' remaining
  unconsumed quantities, decrements reserved balances, appends idempotent RELEASE
  movements, and cancels the fulfillment. All changes are transactional.
- IN_PRODUCTION/READY_TO_SHIP/PARTIALLY_SHIPPED/SHIPPED remain unchanged and open
  one merchant CANCELLATION_CONFLICT. Mixed orders cancel eligible fulfillments
  but remain OPEN while conflicts exist. No fulfillments means the Order cancels.
- Tests construct fulfillments/reservations directly. No routing, reservation
  creation service, production engine, or shipment creation service was added.

## Schema migration

`20260914104405_shopify_nullable_address` was generated and applied with
`npm run db:migrate -- --name shopify_nullable_address` from `libs/db`.
It makes name/line1/city/postalCode/countryCode nullable and adds validationErrors
JSONB, exactly as Task 8 requires. Existing migrations were not edited.

**Generated migration detail:** Prisma also dropped/recreated
`fulfillment_active_queue` with its unchanged predicate, consistent with the
partial-index false positive documented in M2. The generated migration was
retained unchanged. No fulfillment schema or index semantics were changed.

## Judgment calls and limits

- Retry exhaustion uses EXCEPTION / RETRY_EXHAUSTED because ingestion has no
  dead-letter enum. Unknown-topic behavior remains explicitly undecided above.
- Missing/invalid country codes cannot be persisted as arbitrary text in
  VarChar(2); the canonical column becomes null, while raw/normalized payloads
  retain the supplied value and validationErrors explains the problem.
- Payment eligibility is exactly `paid`; authorized, partially paid, refunded,
  and other financial states do not create an Order on initial intake.
- Address replacement updates the single existing address row. UNVERIFIED is
  preserved even when the new fields are syntactically complete. Existing
  address exceptions are not automatically resolved by this ingestion work.
- Any shipment row triggers address preservation, including a pending shipment.
- PARTIALLY_SHIPPED takes the same conflict path as SHIPPED.
- Cancellation at an equal channel timestamp is processed: an orders/updated
  delivery for that same revision must not suppress the cancellation. Ordinary
  updates still use the mandated <= check; older cancellations are ignored.
- Cancellation for a nonexistent canonical Order is a DUPLICATE/no-op. This
  implementation does not introduce a pre-Order cancellation tombstone or a
  generalized event-reconciliation system.
- The automated gate covers the user's scoped assertions. Mapping through the
  embedded app, automatic mapping requeue, browser screenshots and UI assertions
  remain Tasks 10–12 and were not performed.

## Verification — 2026-09-14

| Check | Result |
| --- | --- |
| Address migration applied to existing local Postgres | PASS |
| Targeted normalizer/validator/order/loop tests | PASS |
| `npm run build` at repo root | PASS; 4 workspaces in scope, 3 build scripts, zero type errors |
| `npm test` at repo root, real Postgres | PASS: 88/88 (API 46, worker 37, DB 5), zero skipped/failing tests |
| Scoped Gate M3 worker flow | PASS: paid/mapped, unmapped exception, HELD-to-paid, stale update, cancellation |
| Fulfillment cancellation fixtures | PASS: eligible, conflict, mixed, partial consumption, rollback, duplicate delivery, equal-topic timestamps |
| Legacy-name guard outside CLAUDE.md/README.md/docs/.github | PASS, no matches |
| `git diff --check` | PASS |
| Unknown-topic behavior | PASS — resolved and verified this session, see addendum above |

The worker test glob is now quoted so Node discovers nested order tests.
Previously Git Bash expanded it one directory deep and silently omitted them.
The guard initially found two old `extraneous` lockfile workspace entries;
only those obsolete entries were removed. No dependency versions changed.

Both existing env files target `localhost:5432/fulfillflow_local`. Tests loaded
DATABASE_URL from `libs/db/.env.local`. npm commands used the installed Git Bash
via a process-only `npm_config_script_shell` override because plain `bash`
resolved to an unavailable WSL shell. The root migration wrapper consumed the
name flag; rerunning the documented command directly in libs/db generated the
named migration normally. No new database, db push, or reset was used.

Changes were made sequentially with targeted red/green tests and small commits.
Self-review stayed local, as requested. One intermediate duplicate-lock commit
contained a Prisma void-result deserialization failure; the immediate follow-up
`40c410b` corrected the cast, and subsequent targeted/full verification passes.

## What M4 needs next (not started)

M4 can consume canonical Orders/OrderItems and existing mapped skuIds.
Shipping must require the appropriate verified address state; INVALID and
UNVERIFIED are not shipping approval. Coordinate fulfillment/stock mutations
with the order/fulfillment locking and cancellation transaction introduced here.
The cancellation release path already updates balances and ledger rows, so do
not add a second independent release on the same reservation.

Routing, BOM reservation creation, production lifecycle, shipment creation,
Shopify sync-back, compliance, observability, and deployment remain unimplemented.
