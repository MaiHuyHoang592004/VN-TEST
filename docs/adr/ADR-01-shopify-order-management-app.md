# ADR-01: FulfillFlow is a Shopify order-management app, not a fulfillment-service app

## Status

Accepted (M2).

## Context

Shopify offers two distinct integration shapes for third-party fulfillment
software. A **fulfillment service** registers as a location Shopify routes
orders to automatically, must implement Shopify's own fulfillment-service
callback contract (inventory sync-to-Shopify, service registration,
`fulfillment_order` callback endpoints), and effectively becomes a location
type merchants pick in their shipping settings. An **order-management app**
instead reads the merchant's own merchant-managed `FulfillmentOrder`s and
calls `fulfillmentCreate` against them — the merchant keeps their existing
locations and workflow; FulfillFlow observes and acts on orders assigned to
locations it already knows about. Ingesting order/product data requires
`read_orders`/`read_products`; acting on merchant-managed fulfillment
requires `read_merchant_managed_fulfillment_orders`/
`write_merchant_managed_fulfillment_orders` — see `apps/api/.env.local`
for the full configured scope string. (The `SHOPIFY_SCOPES` code default
and CI intentionally fall back to a minimal `read_orders` alone, since
neither talks to real Shopify.)

The two shapes are not incremental — choosing fulfillment-service commits
the whole M2-onward data model (Store, FulfillmentOrder resolution, sync-back)
to a callback-driven design Shopify controls the timing of, versus the
worker-polls/webhook-driven model everything from M2 onward assumes.

## Decision

FulfillFlow V1 is an order-management app. It never registers as a
fulfillment service, never implements the fulfillment-service callback
contract, never syncs inventory levels back to Shopify, and only ever acts
on `FulfillmentOrder`s already assigned to a **merchant-managed** location —
a `FulfillmentOrder` assigned to a third-party fulfillment-service location
is explicitly unsupported and surfaces `CHANNEL_SYNC_FAILED` rather than
being silently skipped or force-processed (Task 17, M5).

## Consequences

- No `fulfillment_service` webhook topics, no service-location registration
  flow, no inventory-sync-to-Shopify code path exists or is planned for V1.
- A merchant using FulfillFlow alongside a *different* fulfillment-service
  app for other locations works without conflict — FulfillFlow only ever
  touches merchant-managed locations.
- Multi-location merchant-managed fulfillment is supported (Task 18 groups
  allocations by `assignedLocationId`); the fulfillment-service integration
  shape is out of scope for any V1 milestone, not just deferred within this
  one.
