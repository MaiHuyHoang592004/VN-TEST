# Benchmark method

M7 Task 27 calls for a k6 synthetic webhook load test and a synthetic order-
processing throughput benchmark. Neither k6 nor any load-test tooling exists
in this repo or in the environment these were built in (no `k6` binary
installed), so both are small Node scripts instead — exercising the exact
same code the real app runs, not a mock of it.

## What each script does

**`apps/api/scripts/benchmark-webhook-intake.ts`** (`npm run benchmark:webhook -w @fulfillflow/api`)
Boots the real `AppModule` on a real listening port (not `supertest` against
an un-`listen()`'d server — see the gotcha below) and fires
`BENCHMARK_REQUESTS` (default 500) valid-HMAC `POST /webhooks/shopify`
requests at `BENCHMARK_CONCURRENCY` (default 20) concurrency, 10% of them
deliberately reusing an already-sent `X-Shopify-Webhook-Id` — some of those
genuinely concurrent with their own original, not just sequential repeats.
Reports p50/p95/p99/max latency, throughput, error rate, and a dedupe check
(exactly one `IngestionRecord` per unique webhook id).

**`apps/worker/scripts/benchmark-order-processing.ts`** (`npm run benchmark:orders -w @fulfillflow/worker`)
Seeds `BENCHMARK_ORDERS` (default 300) paid, mapped, single-line synthetic
`IngestionRecord`s, then drives the exact `IngestionLoop`/handler registry
`WorkerModule` wires in production (same `NestFactory.createApplicationContext`
call `main.ts` itself uses) until the batch clears. Reports throughput and
per-record processing lag (`processedAt - createdAt`).

Both scripts seed and clean up their own synthetic organization/store/data;
neither touches anything a real run would have created.

## A harness gotcha worth recording

The webhook benchmark originally used `supertest` against `app.getHttpServer()`
without an explicit `.listen()` — the same pattern every other test in this
repo already uses. Under this benchmark's concurrency it produced a ~28%
"error" rate that looked like a server bug (`ECONNRESET`, plus a real one —
see below) but was largely `supertest`'s own implicit per-request ephemeral
listen/close cycle churning under load. Switching to an explicit
`app.listen(0)` + plain `fetch` eliminated it. The fix for the *test suite's*
own new concurrent-delivery test needed the mirror-image care: an explicit
listener has to be explicitly closed (`server.closeAllConnections()` +
`app.close()`) or the test process hangs after its assertions pass instead
of exiting — the earlier fix traded one failure mode for a different one
until both were handled together (see `webhooks.controller.test.ts`'s
"truly concurrent duplicate deliveries" test).

## A real bug this found

Underneath that harness noise, a real one-in-several-dozen-requests failure
survived even after switching to a real listener: `WebhooksController`'s
`ingestionRecord.upsert()` is not atomic against a *genuinely* concurrent
duplicate delivery of the same webhook id (something Shopify's own retry
behavior can produce). Prisma 7's `upsert()` surfaced the race as either a
raw unique-constraint violation (`P2002`) or "no record found for an
upsert" (`P2025`), depending on timing — this repo's existing test suite
never caught it because its only duplicate-delivery test sent deliveries
*sequentially*. Fixed in `webhooks.controller.ts`: on either race error,
re-read the row by `dedupeKey` (the winner's insert already committed) and
use it, rather than surfacing the race as a 500. Covered by a new
regression test (10 genuinely concurrent requests for the same webhook id,
against a real listening server) and re-validated by a clean (0% error)
benchmark run afterward.

## Never claim production scale

Every number in `latest.md` is a real measurement on one shared machine
(4 vCPU, 15 GiB RAM, Ubuntu 24.04, Node 22.22.2), one process, one local
Postgres 16 instance with no other load on it, for a session that never
ran against a real Shopify dev store. That setup says nothing about actual
production capacity, network latency to a real database, or Shopify's own
delivery patterns at scale — it only proves the code's own correctness and
relative throughput under synthetic concurrency, which is what M7 Task 27
asks for.
