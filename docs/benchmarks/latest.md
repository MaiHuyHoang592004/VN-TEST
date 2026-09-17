# Latest benchmark results

See `benchmark-method.md` for what these scripts do, the harness gotcha
they hit, and the real concurrency bug the webhook benchmark found (now
fixed). **These are synthetic, single-machine measurements — never a claim
of production scale.**

## Environment

- Machine: 4 vCPU, 15 GiB RAM, Ubuntu 24.04.4 LTS
- Node: v22.22.2
- PostgreSQL 16, local, single instance, no other load
- Date: 2026-09-17

## Webhook intake — `POST /webhooks/shopify`

Command: `npm run benchmark:webhook -w @fulfillflow/api`
(500 requests, concurrency 20, 10% deliberately-duplicate webhook ids)

| Metric | Value |
| --- | --- |
| Total requests | 500 |
| Concurrency | 20 |
| Total wall time | 1401 ms |
| Throughput | 357 req/s |
| Error rate | 0% (0 / 500) |
| Latency p50 | 48 ms |
| Latency p95 | 77 ms |
| Latency p99 | 203 ms |
| Latency max | 219 ms |
| Unique `IngestionRecord`s created | 453 (for 453 unique webhook ids sent — dedupe check PASS) |

This run is *after* the fix described in `benchmark-method.md`. Before it,
identical runs measured error rates around 27–33% — almost entirely a test-
harness artifact (see the method doc), with one real, now-fixed concurrency
bug underneath it.

## Order processing throughput — `IngestionLoop` end to end

Command: `npm run benchmark:orders -w @fulfillflow/worker`
(300 synthetic paid, mapped, single-line orders)

| Metric | Value |
| --- | --- |
| Orders seeded | 300 |
| Seed time | 238 ms |
| Ticks to clear the batch | 15 |
| Processing wall time | 4188 ms |
| Throughput | 71.6 orders/s |
| Processing lag p50 | 2369 ms |
| Processing lag p95 | 4200 ms |
| Final status | 300/300 `ACCEPTED` |

"Processing lag" is `IngestionRecord.processedAt - createdAt` — how long an
order sat `PENDING` before this run's `IngestionLoop` claimed and finished
it, dominated by the loop's own polling/batch cadence (`batchSize: 20`,
`pollMs: 1000` in `worker.module.ts`) against a backlog seeded all at once,
not by per-order processing cost.

## Reproducing

```bash
cd apps/api && npm run benchmark:webhook
cd apps/worker && npm run benchmark:orders
# Tune with env vars, e.g.:
BENCHMARK_REQUESTS=2000 BENCHMARK_CONCURRENCY=50 npm run benchmark:webhook -w @fulfillflow/api
BENCHMARK_ORDERS=1000 npm run benchmark:orders -w @fulfillflow/worker
```
