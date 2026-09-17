# ADR-06: Postgres-native queues (transactional outbox + SKIP LOCKED), no Redis or message broker

## Status

Accepted (M1 foundation), exercised by every async workflow since.

## Context

FulfillFlow has two fundamentally async concerns: **ingesting** a durably-
received webhook/event without doing business logic in the request path,
and **emitting** external side effects (a Shopify GraphQL mutation, a
future token refresh) exactly once per logical event even though the
triggering write and the side effect can't share one database transaction
with an external HTTP call. Both are classic "job queue" problems, and the
easy default is to reach for Redis (BullMQ) or a message broker. V1 targets
a small, single-operator deployment (ADR-08's own framing) where a second
stateful service is pure operational cost — another connection string,
another failure mode, another thing to keep alive — for a workload this
size doesn't need.

## Decision

Two tables, `IngestionRecord` and `OutboxEvent`, both claimed with the same
Postgres-native primitive: `SELECT ... FOR UPDATE SKIP LOCKED` inside one
transaction that also pushes the row's lease (`nextAttemptAt`/`availableAt`)
into the future, so a crashed worker never leaves a row stuck — the lease
simply expires and the next poll reclaims it. No `PROCESSING` status exists;
a row is either claimable (lease expired) or it isn't. `libs/db/src/queue.ts`
is the one implementation both `IngestionLoop` and `OutboxLoop` share.

The transactional-outbox half of this (`OutboxEvent`) is what makes "one
row = one side effect" hold: a write that needs to trigger an external
effect (M4's `shipFulfillment` creating a `shopify.fulfillment.plan` event)
inserts the outbox row in the **same transaction** as the business write —
the effect can never be lost to a crash between "committed the business
change" and "queued the side effect," because there is no gap; either both
commit or neither does.

## Consequences

- No Redis, no BullMQ, no Kafka, no separate broker process — the plan's
  own "Do not silently expand scope into... Kafka/Redis/Kubernetes,
  microservices" constraint is structural, not just a rule someone has to
  remember not to break.
- Throughput and polling latency are bounded by Postgres row-lock
  contention and `pollMs` (1000ms in `worker.module.ts`), not by a
  purpose-built queue's own tuning — measured and accepted as adequate for
  V1's scale in `docs/benchmarks/latest.md` (M7), not assumed.
- A worker process can restart, be killed, or run as multiple replicas
  without any coordination beyond what Postgres's row locks already give —
  `SKIP LOCKED` means concurrent workers never block each other on the same
  claim, they just get different rows.
- If throughput ever genuinely outgrows this (verified via the M7
  benchmarks' numbers, not assumed), the migration path is a new
  `LoopOptions` tuning pass first, and only a real broker if that's
  insufficient — not a default reached for pre-emptively.
