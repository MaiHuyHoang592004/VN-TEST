# CV bullets

Factual and measurable only — each bullet is backed by a specific test,
benchmark, or file in this repo, cited inline for anyone who wants to
verify it rather than take it on faith. Do not use a bullet that claims
something the live Shopify closed-loop run would prove until that run has
actually happened (Gate H0 — see `docs/demo/demo-script.md`).

## Ready to use

- Built an embedded-installation Shopify order-management app (NestJS API +
  worker, PostgreSQL, React-free API-only merchant surface) processing
  orders through a durable, Postgres-native asynchronous ingestion
  pipeline — no Redis or message broker — measured at 357 webhook
  requests/sec with a 0% error rate under synthetic concurrent load
  (`docs/benchmarks/latest.md`).
- Designed an exception-driven recovery model (one queryable, resolvable
  row type — `ExceptionCase` — for every "needs a human" condition across
  ingestion, routing, inventory, and Shopify sync) that automatically
  requeues and resumes an order the moment its blocking condition is
  resolved, with zero manual database intervention
  (`docs/adr/ADR-05-exception-driven-consistency.md`).
- Implemented idempotent webhook intake, a transactional outbox for
  external side effects, and Postgres `SKIP LOCKED` worker queues,
  including finding and fixing a real concurrency race (`upsert()` was not
  atomic against genuinely simultaneous duplicate webhook delivery) via a
  purpose-built load-testing script — not just measured around it
  (`docs/benchmarks/benchmark-method.md`).
- Built atomic, concurrency-safe inventory reservation (a single guarded
  SQL `UPDATE` per component) proven correct under 20 concurrent
  reservation attempts against a stock of 10 (exactly 10 succeed, zero
  overshoot) and re-verified end to end through the real order-acceptance
  path, not just the reservation primitive in isolation
  (`apps/worker/src/reliability/m6-reliability.integration.test.ts`).
- Implemented Shopify token lifecycle management — expiring offline
  tokens, optimistic-lock refresh rotation safe under concurrent
  refreshers, and AES-256-GCM encryption at rest — with automatic
  proactive rotation via a scheduled background sweep, not just
  refresh-on-failure (`docs/adr/ADR-02-expiring-offline-token.md`).
- Wrote a minimal, Zod-validated configurable rule engine (merchant
  automation rules: hold/allow an order by country, financial status,
  SKU, or quantity) sharing one validation schema between the API layer
  that persists a rule and the worker that evaluates it, so a rule that
  passes validation can never reach an evaluator that doesn't understand
  its shape (`libs/core/src/policy/policy-engine.ts`).

## Only after Gate H0 (the live Shopify dev-store run) — do not use yet

- Anything claiming an order was actually processed against live Shopify
  infrastructure end to end.
- Anything claiming Shopify's protected-customer-data review was passed.
- Anything claiming the app is installed on a real (even test) merchant
  store.
