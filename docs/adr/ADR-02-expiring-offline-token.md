# ADR-02: Managed installation with an expiring offline token, no OAuth redirect

## Status

Accepted (M2).

## Context

Shopify apps created after April 2026 default to **managed installation**:
Shopify handles the install/scope-grant UI itself, and the app never
implements an OAuth `authorize`/`callback` redirect flow. The embedded
app's first load hands the backend a verified App Bridge **ID token**; the
backend exchanges that token for an **offline access token** via
`grant_type=urn:ietf:params:oauth:grant-type:token-exchange` — no
`code`/`state` query-string dance, no redirect URI to register or defend
against open-redirect issues.

Offline tokens created this way are **expiring** by default for apps using
managed installation: unlike the legacy non-expiring offline token, they
carry an `expires_in` and a `refresh_token` with its own, longer expiry.
This is Shopify's default behavior for the app's installation mode, not
something requested via a parameter — `exchangeIdToken` sends the standard
token-exchange grant fields and simply persists whatever token shape
Shopify returns (see Decision). The token itself must be rotated before it
lapses, not just requested once at install time.

## Decision

- Managed installation only. No `/oauth/authorize` route, no redirect URI,
  no `state` CSRF token to manage — session identity comes entirely from
  verifying the App Bridge ID token's signature, `aud`, `iss`/`dest` host,
  and `exp`/`nbf` window (`ShopifySessionGuard`).
- Token exchange (`exchangeIdToken` in `shopify-auth.client.ts`) posts only
  the standard token-exchange grant fields — `client_id`, `client_secret`,
  `grant_type`, `subject_token`, `subject_token_type`,
  `requested_token_type` — there is no `expiring` parameter to request.
  Shopify decides expiring vs. non-expiring based on the app's own
  managed-installation status, and the client tolerates either response
  shape (`refreshToken`/`accessTokenExpiresInSeconds` are optional on
  `TokenResponse`). Persist the access token and, when present, its refresh
  token, encrypted at rest via `encryptToken`/`decryptToken` in
  `libs/core/src/shopify/token-crypto.ts` (AES-256-GCM; see
  `docs/security/data-handling.md` for the concrete cipher format).
- Rotate proactively: `ShopifyTokenManager.withAccessToken` refreshes any
  token within 5 minutes of expiry before use, and (M6) a scheduler
  independently sweeps for stores expiring within 15 minutes and enqueues a
  refresh via the outbox rather than waiting for the next API call to
  discover the problem.
- Refresh uses `Store.tokenVersion` as an optimistic lock: two concurrent
  refreshers never both write a torn state; the loser re-reads and uses the
  winner's token rather than erroring or double-rotating.
- Any refresh failure — invalid_grant, network error, or a race where the
  store was disconnected mid-refresh — durably marks the `Store` `ERROR`,
  clears the now-worthless credentials, and opens one merchant-visible
  `CHANNEL_SYNC_FAILED` exception telling the merchant to reopen the app.

## Consequences

- No token, ever, appears in a log line, an `OutboxEvent` payload, or an
  `AuditLog` detail — `apps/worker/src/observability/logger.ts` redacts
  token-shaped keys defensively, but the real guarantee is that nothing
  intentionally writes one anywhere but the encrypted `Store` columns.
- A merchant whose refresh token itself expires (they revoked access, or it
  simply lapsed) must reopen the embedded app to re-bootstrap — there is no
  silent background re-auth, by design; a dead credential should surface as
  a visible, actionable state, not retry forever.
- This is exactly the shape a fulfillment-service app would also use for
  auth — ADR-02 is independent of the order-management-vs-fulfillment-service
  choice in ADR-01.
