# M5 closed-loop checklist — Shopify → FulfillFlow → Shopify

Gate M5 (per `docs/superpowers/specs/2026-09-14-fulfillflow-complete-implementation-plan.md`,
Task 19): the dev-store flow works without any DB edits or manual SQL.

**Status as of this checklist's authoring session:** the automated,
credential-free half of this loop (resolve → plan → create, Tasks 17–18)
has its own passing acceptance test —
`apps/worker/src/channels/shopify/fulfillment/m5-acceptance.e2e.test.ts` —
against a fake Shopify GraphQL server. The steps below are the *live*
dev-store run, which needs Human Setup Gate H0 (a real Shopify dev store +
`SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET`/`TOKEN_ENC_KEY`/a tunnel URL) that
has not been done in this repo yet — `shopify.app.toml` doesn't exist,
and no store has ever completed the token-exchange bootstrap. Do not check
any step below off from reading the code; each one needs an actual
browser + Shopify admin session.

## Prerequisites (one-time, per Gate H0)

- [ ] Shopify Partners: unpublished public app `FulfillFlow Connect`, dev
      store (e.g. `fulfillflow-dev.myshopify.com`), managed-installation
      scopes `read_orders,read_products,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders`.
- [ ] `apps/api/.env.local` (or the real deploy env) has real
      `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, a 32-byte base64
      `SHOPIFY_TOKEN_ENC_KEY`, `SHOPIFY_APP_URL` pointed at the CLI tunnel,
      and `OPERATOR_API_KEY` set. `apps/worker/.env.local` has the matching
      `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET`/`SHOPIFY_TOKEN_ENC_KEY`.
- [ ] `shopify app dev` is running and the app opens embedded in the dev
      store admin.
- [ ] `npm run build && npm test` green at repo root (proves the local
      checkout matches this checklist).
- [ ] `apps/worker`'s process is running (`npm run start -w @fulfillflow/worker`
      or `npm run dev -w @fulfillflow/worker`) — the outbox/ingestion loops
      only run there, not in `apps/api`.
- [ ] At least one Shopify test variant is mapped to an internal SKU
      (`PUT /app/sku-mappings` — or directly via `StoreSkuMapping` if the
      embedded SKU-mapping UI isn't built yet in this checkout).

## Steps

1. **Bootstrap.** Open the embedded app in the dev store admin. Confirm
   `POST /app/session/bootstrap` created one `Store(ACTIVE)` and
   `GET /app/session` returns 200 (Gate M2's own check — re-verify here
   since a stale/expired dev token silently breaks everything downstream).
2. **Place a paid test order** in the dev store admin (or via the storefront)
   using the mapped variant from the prerequisites.
3. **Wait for ingestion.** Confirm exactly one `IngestionRecord` reaches
   `ACCEPTED` for `orders/create`, and one canonical `Order` + `OrderItem`
   exist. Confirm routing/reservation ran automatically
   (`RoutingDecision(SELECTED)`, one `Fulfillment(QUEUED)`).
4. **Validate the address** if the order's `OrderAddress.validationStatus`
   isn't already `VALID` (correct it via the merchant API/UI if built, or
   directly if not — this is a pre-M5 concern, not new to this checklist).
5. **Progress the fulfillment** through the operator API:
   `POST /operator/fulfillments/:id/start`, then
   `.../complete-production`, then `.../ship` with synthetic tracking
   (`carrier`, `trackingNumber`). `scripts/demo/create-demo-shipment.ts`
   automates this step end-to-end given the order's Shopify display number:

   ```bash
   node --env-file-if-exists=apps/api/.env.local --experimental-strip-types \
     scripts/demo/create-demo-shipment.ts --order "#1001" --carrier "Demo Post"
   ```

6. **Wait for Shopify order routing.** Shopify only exposes `FulfillmentOrder`
   line items once it finishes routing the order to a location — this can
   lag the initial webhooks. If Task 17's cache is still empty when the
   planner runs, `shopify.fulfillment.plan` retries with backoff rather
   than failing; give it a few minutes before treating a stuck `PENDING`
   `shopify.fulfillment.plan`/`shopify.fulfillment.create` event as a
   real problem.
7. **Confirm the sync-back.** In the Shopify admin, the order should show
   **Fulfilled** (or partially fulfilled) with the tracking number/company
   from step 5. In FulfillFlow's DB: `Shipment.externalFulfillmentId` is
   set, the `shopify.fulfillment.plan` and its child
   `shopify.fulfillment.create` `OutboxEvent`s are both `SENT`, and exactly
   one `DeliveryAttempt(DELIVERED)` exists for the create event.
8. **Prove idempotency.** Re-trigger the same sync path — the simplest
   repeatable way without re-shipping (which the DB's own
   `(provider, trackingNumber)` uniqueness blocks) is to re-enqueue the
   existing child event for reprocessing:

   ```sql
   -- read-only-adjacent housekeeping, not a schema/business-data edit:
   -- resets one specific event's lease so the worker reclaims it.
   UPDATE "OutboxEvent" SET "availableAt" = now(), status = 'PENDING'
   WHERE "aggregateId" = '<shipmentId>' AND handler = 'shopify.fulfillment.create';
   ```

   Confirm the Shopify order does **not** show a second Fulfillment and
   FulfillFlow does not call `fulfillmentCreate` a second time — the
   handler's `externalFulfillmentId` + single-location-group check
   (Task 18 Step 5) short-circuits before any HTTP call. A second
   `DeliveryAttempt` row is *not* created for this replay for the same
   reason (no HTTP call happened).

## What NOT to do

- Never edit `Order`/`Fulfillment`/`Shipment`/`OutboxEvent` rows by hand to
  force the loop to "pass" — Gate M5 is specifically about the loop working
  *without* manual SQL. Step 8's `UPDATE` above is the one sanctioned
  exception, and only because there is no product surface yet for
  "resync this shipment" — it resets a lease, it does not fabricate state.
- Never commit a captured access/refresh token, `SHOPIFY_API_SECRET`, or a
  real customer's order payload from the dev store. All dev-store data
  must be synthetic test data.
