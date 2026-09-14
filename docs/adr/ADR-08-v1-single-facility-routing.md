# ADR-08: V1 routing is single-facility, capability-gated, and deterministic

## Status

Accepted (M4).

## Context

FulfillFlow V1 targets one small operator running the fulfillment side of a
single Shopify store. Splitting one order's line items across multiple
facilities (multi-facility routing, partial-facility fallback, rebalancing)
adds real complexity — coordinating N `Fulfillment` rows, N shipments, and
merge/partial-tracking sync-back per order — with no product requirement in
V1 to justify it. `routeOrder()` needs a rule that is simple to reason about,
cheap to test exhaustively, and doesn't block M5's Shopify FulfillmentOrder
sync-back on an unsolved split-shipment design.

## Decision

One order routes to exactly one facility, chosen deterministically:

1. **Eligibility.** A facility is a candidate only if `status = ACTIVE` and it
   has an `enabled` `FacilitySkuCapability` row for every distinct SKU on the
   order. Missing or disabled coverage for even one line disqualifies the
   facility entirely — V1 does not split an order across facilities to cover
   partial capability.
2. **Scoring.** `FacilitySkuCapability.priority`/`leadTimeHours` are
   per-facility-**and**-SKU. For a multi-SKU order, a facility is scored by
   its weakest link across the order's SKUs: the **lowest** `priority` and
   the **longest** `leadTimeHours` among the order's lines at that facility.
   This is a judgment call — the schema doesn't dictate an aggregation rule —
   made conservatively so one under-provisioned SKU can't hide behind a
   strong score on the rest of the order.
3. **Ranking.** Candidates sort by: higher `priority` first, then lower
   `leadTimeHours` (a facility with no `leadTimeHours` recorded for a
   relevant SKU sorts last, not first — an unknown lead time is never treated
   as "instant"), then `facility.code` ascending as a final deterministic
   tie-break. The same inputs always produce the same route.
4. **No candidate.** Creates `RoutingDecision(NO_ROUTE)`, opens one
   `ExceptionCase(NO_ELIGIBLE_FACILITY, visibility: INTERNAL)` keyed to
   `order:<id>`, and creates **no** `Fulfillment`. This is an operator
   configuration gap (no facility covers this catalog), not something a
   merchant can act on — hence INTERNAL, not MERCHANT.
5. **Selected.** Creates `RoutingDecision(SELECTED)` and exactly one
   `Fulfillment(kind: ORIGINAL, status: QUEUED)` with one `FulfillmentItem`
   per `OrderItem`, at the full order quantity — V1 does not attempt partial
   quantity routing either.
6. Inventory availability is **advisory only** at routing time; `routeOrder`
   never inspects `InventoryBalance`. `reserveFulfillment` (Task 14) is the
   sole authority on whether stock actually exists, and its failure blocks
   the `Fulfillment` rather than unwinding the route or the canonical Order.

`RoutingDecision.strategyVersion` is recorded as `"v1-single-facility"` on
every decision so a future multi-facility strategy can be introduced
side-by-side and distinguished in history without a migration.

## Consequences

- Replacement fulfillments (`kind: REPLACEMENT`, out of V1 scope) and
  multi-facility split-shipment are explicitly deferred; nothing here
  prevents adding a `strategyVersion: "v2-*"` path later.
- A catalog change (disabling a facility's capability for a SKU already
  routed) does not retroactively re-route existing `Fulfillment` rows —
  `routeOrder` only runs once, when an order is first accepted.
- Because scoring is "weakest link," a merchant who wants one strong facility
  to win an order regardless of a secondary SKU's poor coverage there must
  set that SKU's `priority`/`leadTimeHours` deliberately, not rely on
  averaging across the order.
