# Threat model

M8 Task 29. Scoped to what this app actually does — a Shopify order-
management integration processing webhooks, holding merchant OAuth tokens,
and calling back to Shopify's Admin API — not a generic checklist.

## Assets

1. **Shopify offline access/refresh tokens** — the highest-value asset.
   Anyone holding one can act as the app against that merchant's store
   within the granted scopes (read orders/products, read/write
   merchant-managed fulfillment orders).
2. **Customer PII** — name, email, phone, shipping address, per
   `data-handling.md`'s protected-fields list.
3. **Merchant business data** — orders, inventory levels, automation rules
   (a leaked rule reveals nothing sensitive on its own, but a *tampered*
   one could hold orders or leak them through incorrectly, a business-logic
   integrity concern rather than a confidentiality one).
4. **Platform integrity** — the worker's ability to correctly process
   ingestion/outbox queues without one tenant's data or load affecting
   another's.

## Trust boundaries

```
Shopify  --webhook (HMAC)-->  apps/api  --durable insert-->  Postgres  <--claim--  apps/worker  --GraphQL (Bearer token)-->  Shopify
Merchant --session token-->   apps/api  (tenant-scoped /app/**)
Operator --API key-->         apps/api  (/operator/** — internal only)
```

Three distinct callers reach `apps/api`, each with its own auth mechanism
(HMAC for Shopify webhooks, session token for merchants, API key for
operators) — none of them share a credential, and none of `apps/worker`'s
outbound calls are reachable *from* the internet (it only calls out to
Shopify, nothing calls in).

## Threats and mitigations

### T1 — Forged webhook delivery (spoofing)

An attacker POSTs a fabricated `orders/create` (or, worse, `app/uninstalled`
or a redact topic) without being Shopify.

**Mitigation:** every request is HMAC-verified over the raw body before
anything else happens — no store lookup, no DB write — using a timing-safe
comparison (`hmac.ts`). A forged request without the shared secret is
rejected with 401 and creates zero rows.

### T2 — Stolen/leaked Shopify token (elevation of privilege)

A token exfiltrated from the database, a log, or memory lets an attacker
call Shopify's Admin API as the app.

**Mitigations:** encrypted at rest (AES-256-GCM, random IV per row —
`token-crypto.ts`); never written to logs/outbox/audit by construction,
with the worker logger's redaction as a backstop; short-lived (expiring
offline tokens, ADR-02) so a leaked token has a bounded useful life even if
never explicitly revoked; `app/uninstalled` clears credentials immediately.
**Residual risk:** `SHOPIFY_TOKEN_ENC_KEY` itself, held in the deploy
environment's env vars — compromising the process's environment defeats
the encryption. No key-rotation-without-downtime mechanism exists yet
(`Store.tokenVersion` rotates the *token*, not the *encryption key*); out
of scope for V1.

### T3 — Cross-tenant data access (tampering / information disclosure)

A merchant (or an attacker with one merchant's session) tries to read or
modify another organization's orders, rules, or metrics.

**Mitigation:** every `/app/**` query/mutation is scoped by
`TenantContext.organizationId`, sourced only from the verified session +
resolved `Store` row — never from a request body/query id an attacker
could substitute (CLAUDE.md's tenant-boundary rule, tested explicitly for
both automation-rules and overview). A request for another org's resource
by id 404s (not 403) — it doesn't confirm the resource's existence.

### T4 — Replay of a captured session token (spoofing)

An attacker captures a valid App Bridge ID token and replays it after the
legitimate session ends.

**Mitigation:** tokens are short-lived JWTs with `exp`/`nbf` verified on
every request (`ShopifySessionGuard`/`ShopifyTenantGuard`); there is no
long-lived session cookie to steal. Residual window is the token's own
lifetime (Shopify-controlled, typically minutes).

### T5 — Duplicate/replayed webhook causing a duplicate side effect (tampering)

Shopify (or an attacker) redelivers the same webhook, risking a duplicate
`Order`, a duplicate Shopify `fulfillmentCreate` mutation, or a double
refund-equivalent action.

**Mitigations:** `IngestionRecord.dedupeKey` uniqueness (now race-safe
under true concurrency, M7); `Order.sourceKey`/`(storeId, externalId)`
uniqueness prevents a second canonical Order; the transactional outbox's
"one row = one side effect" invariant (ADR-06) plus the shipment sync
handler's own idempotency check (`Shipment.externalFulfillmentId` already
set → no second mutation) prevent a duplicate Shopify-side fulfillment.

### T6 — A worker crash losing or duplicating in-flight work (denial of service / integrity)

The worker process dies mid-batch.

**Mitigation:** `SKIP LOCKED` + lease expiry (ADR-06) means a crashed
worker's claimed-but-unfinished rows simply become claimable again once
the lease lapses — no row is permanently stuck, and no row is double-
processed while a lease is still held (a different worker can't claim a
locked row). Covered by `ingestion-claim-loop.test.ts`'s lease-expiry test.

### T7 — Resource exhaustion via merchant write endpoints (denial of service)

A malicious or buggy client hammers `/app/automation-rules` with writes.

**Mitigation:** `MerchantWriteRateLimitGuard` (30 writes/min/tenant, added
this session — see `data-handling.md`). **Not yet mitigated:** the webhook
endpoint itself has no rate limit beyond Shopify's own delivery behavior
(webhooks are HMAC-authenticated, so an attacker without the shared secret
can't produce accepted load, but an attacker who floods *invalid*-HMAC
requests could still cost CPU on the HMAC comparison itself — a low-value,
low-likelihood attack given the comparison is cheap, not treated as
in-scope for V1).

### T8 — Malicious/malformed automation-rule JSON (tampering)

A merchant (or a compromised merchant session) submits a rule with an
unexpected `conditions` shape, attempting to break the policy engine or
inject something the evaluator mishandles.

**Mitigation:** `RuleConditionsSchema`/`RuleActionSchema` (Zod,
discriminated union) validate on write, in `apps/api`, *before* persistence
— a rule that fails validation is rejected with 400 and never reaches the
`AutomationRule` table, so the worker's evaluator (M7 Task 25) can never
encounter a shape it wasn't built for. Same schema on both sides (ADR-04)
means "validates" and "evaluates correctly" can't drift apart.

## Out of scope for this review

- Railway/hosting-platform-level threats (network segmentation, host
  hardening) — Task 28 hasn't run yet.
- Shopify Admin API's own security posture — trusted as the platform.
- Physical/insider threats to the database host.
