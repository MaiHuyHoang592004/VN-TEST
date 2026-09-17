# 90-second demo script

**Status: designed and ready to run, not yet performed against a live
Shopify store.** Gate H0 (a real Shopify dev store + API credentials —
`docs/demo/closed-loop-checklist.md`) has not been completed in this repo.
Everything below the credential-free line has actually run and passed;
everything above it is the intended script for the moment Gate H0 closes.

There is no embedded merchant UI in V1 (ADR-03) — this demo narrates
through Shopify's own admin (for the order) and the operator API (for
fulfillment), not a FulfillFlow-hosted screen.

## The script (once Gate H0 is closed)

| Time | What happens | What it proves |
| --- | --- | --- |
| 0–10s | Place a paid test order in the Shopify dev store admin, using a variant already mapped to an internal SKU | The app is a real installed Shopify app, not a mock |
| 10–25s | Switch to a terminal/log view: the webhook arrived, `IngestionRecord` went `PENDING → ACCEPTED`, an `Order` and `Fulfillment(QUEUED)` exist with inventory reserved | Fully automatic ingestion → routing → reservation, no human touch |
| 25–40s | Place a **second** order using an *unmapped* variant | The exception path, live |
| 40–55s | Add the missing `StoreSkuMapping`; the stuck `IngestionRecord` requeues automatically and resolves to `ACCEPTED` | "Escalate the exceptions" — one merchant action, no manual DB fix |
| 55–70s | Drive the first order through `POST /operator/fulfillments/:id/start` → `.../complete-production` → `.../ship` (or `scripts/demo/create-demo-shipment.ts` in one command) | The fulfillment lifecycle and manual shipment creation |
| 70–85s | Refresh the order in the Shopify dev store admin: **Fulfilled**, with the synthetic tracking number attached | The closed loop — Shopify → FulfillFlow → Shopify, no manual Shopify-side edit |
| 85–90s | `GET /app/overview` — real `ordersReceived`/`straightThroughRate` numbers for the session just run | The product's own metrics are real measurements, not invented benchmarks |

Run it with `docs/demo/closed-loop-checklist.md`'s full prerequisite list
and step-by-step commands — this table is the narration, that file is the
actual runbook.

## What's reproducible today, without Gate H0

The same mechanics, proven automatically, every time the test suite runs
(`npm test`, 203/203, three consecutive clean runs as of M7):

- `apps/worker/src/channels/shopify/fulfillment/m5-acceptance.e2e.test.ts` —
  the exact resolve → plan → create sync-back sequence, against a fake
  Shopify GraphQL server standing in for step 55–85 above.
- `apps/worker/src/reliability/m6-reliability.integration.test.ts` — the
  unmapped-SKU-then-mapped-then-requeued sequence from steps 25–40 above,
  end to end.
- `docs/benchmarks/latest.md` — the webhook-intake and order-processing
  throughput this demo's steps 0–25 rely on, measured, not asserted.

These are the credential-free proof that the mechanics work; the live
version above is the same mechanics against real Shopify infrastructure,
which is the one thing an automated test can't stand in for.
