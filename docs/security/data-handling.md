# Data handling and security review

M8 Task 29. Checked against the actual code in this repo as of M7, not
aspirational — each line below names the file that makes it true, or is
flagged as an open gap.

## Secrets

- [x] Secrets only in env; no `.env*` file is committed
  (`.gitignore`: `.env` / `.env.*`, `!.env.example`). Every workspace ships
  a `.env.example` documenting what it needs (`SHOPIFY_API_KEY/SECRET`,
  `SHOPIFY_TOKEN_ENC_KEY`, `OPERATOR_API_KEY`, `DATABASE_URL`) without real
  values.
- [x] Shopify access/refresh tokens are encrypted at rest — AES-256-GCM,
  one random 12-byte IV per encryption (so identical plaintext never
  produces identical ciphertext), a one-byte format-version prefix, and a
  16-byte auth tag Postgres/the app never needs to trust separately — an
  altered ciphertext fails authentication on decrypt rather than silently
  decrypting garbage (`libs/core/src/shopify/token-crypto.ts`).
  `SHOPIFY_TOKEN_ENC_KEY` must decode to exactly 32 bytes, validated at
  process startup (`loadEnv`), not on first use.
- [x] No token, ever, appears in a log line, `OutboxEvent` payload, or
  `AuditLog` detail by design (ADR-02); `apps/worker/src/observability/logger.ts`
  additionally redacts token/secret/password/authorization-shaped keys
  recursively as a defense-in-depth backstop, not the primary guarantee.

## Merchant API tenant isolation

- [x] Every `/app/**` route (session, automation-rules, overview) derives
  `organizationId` exclusively from `TenantContext` — populated by
  `ShopifyTenantGuard` from a verified session token plus the `Store` row
  it resolves to, **never** from request body or query
  (`apps/api/src/shopify/tenant.guard.ts`, CLAUDE.md's own tenant-boundary
  rule). Covered by cross-tenant isolation tests in both
  `automation-rule.controller.test.ts` (a `PATCH`/`DELETE` on another
  org's rule 404s) and `overview.controller.test.ts` (one org's orders
  never appear in another's metrics).
- [x] `/operator/**` (internal fulfillment commands) is gated by a separate
  mechanism entirely — `OPERATOR_API_KEY` — and is **always** 401 unless
  that key is explicitly configured, in every environment, not just
  production (`apps/api/src/operator/operator-api-key.guard.ts`; a
  deliberately stricter reading than the plan's literal wording, recorded
  in HANDOVER-M4).

## Webhook intake

- [x] HMAC-SHA256 over the exact raw request body (`req.rawBody`, kept by
  `rawBody: true` on the Nest app), timing-safe comparison
  (`node:crypto`'s `timingSafeEqual`) against `X-Shopify-Hmac-Sha256`
  (`apps/api/src/shopify/hmac.ts`).
- [x] Idempotent by construction: `IngestionRecord.dedupeKey` is unique on
  `X-Shopify-Webhook-Id`. As of M7, the dedupe path is also race-safe under
  genuinely concurrent duplicate delivery, not just sequential redelivery —
  see `docs/benchmarks/benchmark-method.md` for the bug this found and the
  fix.
- [x] No business processing happens in the webhook request path — it does
  exactly HMAC verify → resolve store → durable insert/dedupe → commit →
  200, per the plan's own Global Constraints. Business logic runs later, in
  the worker, off the request's critical path.

## Protected customer data

Shopify's protected-customer-data review (Human Setup Gate H0, still open —
HANDOVER-M2/M5) requires declaring exactly which protected fields the app
uses and why. What this app actually persists:

- **Customer name, email** (`Order.customerName`/`customerEmail`) — needed
  to identify who an order/shipment is for and to notify on fulfillment
  (`notifyCustomer: true` in the `fulfillmentCreate` mutation, Task 18).
- **Shipping address, full** (`OrderAddress`) — needed to ship the order;
  this is the one field set fulfillment cannot function without.
- **Phone** (`OrderAddress.phone`) — carried through when the channel
  provides it (some carriers require it for delivery); not required for
  the app's own logic beyond storage/eventual redaction.
- Nothing else protected is requested or stored — no payment details (never
  requested; Shopify itself handles payment), no browsing history, no
  marketing consent data.

## Retention and erasure

- [x] `shop/redact`/`customers/redact` webhook handlers purge raw
  `IngestionRecord` payloads and anonymize the PII fields above
  (`Order.customerName`/`customerEmail`, every `OrderAddress` field except
  `countryCode` — kept as non-PII aggregate shipping-destination data) —
  M6 Task 20. `customers/data_request` records an audit-only entry (no
  email/phone persisted in the audit row itself) since V1 does not
  auto-export a data package.
- [x] Independent of an explicit redact request, `IngestionRecord.rawPayload`
  older than 30 days is purged automatically by a scheduler
  (`PiiRetentionScheduler`, M6 Task 21) — raw captured webhook JSON doesn't
  linger indefinitely even for a merchant who never triggers redaction.
- [x] `app/uninstalled` disconnects the store, clears its encrypted
  credentials, and dead-letters pending outbound work for it — a fresh
  `withAccessToken` call after uninstall fails before attempting any new
  Shopify request (M6 Task 20, verified in the M6 reliability suite).

## Rate limiting

- [x] Merchant WRITE endpoints (`POST`/`PATCH`/`DELETE` on
  `/app/automation-rules`) are rate-limited per tenant — 30 requests/minute,
  in-memory fixed window (`MerchantWriteRateLimitGuard`, added this
  session as part of this review — the plan's own checklist item, not
  previously implemented). Read endpoints (`GET`) are unthrottled;
  `/operator/**` and `/webhooks/shopify` are not tenant-write-shaped
  surfaces and aren't in scope for this guard. Known V1 limitation: the
  limiter is per-process, in-memory — correct for the plan's own one-
  replica V1 deployment target (Task 28), not for a future multi-replica
  API without a shared store (Redis or Postgres-backed) behind it.

## Dependency audit

`npm audit --omit=dev` (2026-09-17): 12 vulnerabilities (4 moderate, 8
high), all transitive, all inside `@prisma/adapter-pg`'s own dependency
tree (`@nestjs/platform-express`/`@nestjs/core` version ranges Prisma's
tooling pulls in, `mysql2`, `valibot` — none of which this app uses
directly; `mysql2` in particular is dead weight pulled in by a Prisma
driver-adapter package this project doesn't use for MySQL). All fixes
Prisma's own tooling offers require a breaking Prisma downgrade
(`prisma@6.19.3`, undoing the Prisma 7 upgrade this whole codebase is
built on) — accepted as a known, tracked gap rather than taken, since none
of the flagged packages are reachable from this app's own runtime code
path. Re-run `npm audit` whenever `@prisma/adapter-pg` itself updates, since
that's the actual fix (a version that stops depending on the vulnerable
ranges), not a version pin this repo controls directly.

## What this review does not cover

- Shopify's own protected-customer-data approval (Human Setup Gate H0) —
  external, not something a code review can substitute for.
- Railway's own platform security posture (Task 28, not yet performed).
- A real penetration test against a live deployment — this is a static
  review of the code and its dependencies, not a runtime audit.
