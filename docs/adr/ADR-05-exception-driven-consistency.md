# ADR-05: Every "something needs a human" moment is the same row type

## Status

Accepted (M1 schema, exercised by every milestone since).

## Context

FulfillFlow's own product thesis (README, Task 30) is "automate the
routine, escalate the exceptions." That only holds if "escalate" means one
consistent, queryable, resolvable thing everywhere it happens — an unmapped
SKU, an insufficient-stock block, a policy hold, a ledger drift, a channel
sync failure — rather than each subsystem inventing its own ad hoc error
row, flag column, or log line. A merchant's (or operator's) "what needs my
attention right now" view is only meaningful if it's one query, not a
UNION across a dozen different shapes.

## Decision

`ExceptionCase` is that one row type, used by every subsystem:

- **`visibility: MERCHANT | INTERNAL`** — MERCHANT is something the
  merchant can act on directly (map a SKU, fix an address, resolve a policy
  hold); INTERNAL is an operator/operations concern (no eligible facility,
  insufficient stock, a ledger drift) that a merchant seeing it couldn't do
  anything about. The `/app/**` merchant API surface only ever returns
  MERCHANT rows (Task 11's whitelist, carried into M7's overview metrics).
- **`code: ExceptionCode`** (a real enum, not a free string) — new codes are
  a migration, deliberately; a code any handler can invent freely would
  defeat having a fixed vocabulary to build UI and metrics against. Several
  codes (`POLICY_HOLD`, `LEDGER_DRIFT`) were added to the enum in M1 before
  any code used them, anticipating M6/M7 rather than migrating twice.
- **`subjectKey`** (`"order:<id>"`, `"fulfillment:<id>"`, `"shipment:<id>"`,
  `"ingestion:<id>"`, or `"store:<id>"`) plus a partial unique index — at
  most one **OPEN** exception per `(subjectKey, code)` — is the dedup
  mechanism every handler relies on (`openException`/`openOrderException`):
  calling it twice for the same still-open problem is a safe no-op, not a
  duplicate row to clean up later.
- **`exception_has_subject`** (ADR-07): every row must point at something
  concrete — one of `ingestionRecordId`/`orderId`/`fulfillmentId`/
  `shipmentId`, or a `store:%` subjectKey for the one case with no row of
  its own to reference. A subject-less exception would be unresolvable by
  construction — nothing to click through to.
- **Resolution is a status transition** (`OPEN → RESOLVED`/`IGNORED`), not a
  delete — an exception's history (who opened it, what it said, when and
  how it resolved) stays queryable indefinitely, the same append-only
  instinct the inventory movement ledger and audit log both follow.

## Consequences

- A genuinely global-not-tenant-scoped concern (M6's `LEDGER_DRIFT`, since
  `Facility`/`InventoryItem` have no `organizationId`) still has to satisfy
  `exception_has_subject`'s per-org requirement by borrowing a concrete
  subject from context (the most recent `Fulfillment` that touched the
  pair) rather than being exempted from the pattern — a special case in
  *resolving* the subject, not a second exception shape.
- Every new milestone's "what needs attention" answer (M7's `needsAttention`/
  `manualTouchRate` overview metrics) is a query over this one table, not a
  new aggregation each subsystem has to reimplement.
- A handler that wants to raise something genuinely uncategorized still has
  to pick an existing code or add one via migration — there is no generic
  `OTHER`/`UNKNOWN`-as-default escape hatch encouraged by convention (the
  enum's own `UNKNOWN` value exists for truly unclassifiable cases, not as
  a default to reach for first).
