# ADR-03: V1 ships without an embedded merchant UI

## Status

Accepted (M3), scope-limited — revisit before claiming a "complete
embedded app" rather than a backend-plus-API platform.

## Context

The plan's M3 (Tasks 10–12) specifies a React/Vite `apps/shopify-web`
embedded app — an Orders page, an exception-action UI, and a SKU-mapping
screen, served same-origin from the NestJS API and using Shopify App
Bridge/Polaris web components. Building it is real, UI-specific work
(component layout, App Bridge wiring, i18n, browser testing) distinct from
the ingestion/routing/inventory/shipment backend the rest of M3–M7 depend
on, and none of that backend work requires the UI to exist first — the
merchant Orders API, SKU-mapping API, and later the automation-rule/overview
API (M7 Task 26) are all independently useful and independently testable
via HTTP without a frontend consuming them.

This was an explicit, deliberate narrowing of scope made once, in the M3
session (HANDOVER-M3): "the user's narrower scope overrides the plan's
broader M3: Tasks 10–12, including mapping API/UI and merchant Orders
UI/API, are excluded." Every session since (M4–M7) has continued to treat
that as the standing scope rather than re-litigating it per milestone.

## Decision

No `apps/shopify-web` exists in this codebase as of M7. Merchant-facing
functionality ships as HTTP API only (`/app/session`, and as of M7
`/app/automation-rules`, `/app/overview`) with `ShopifyTenantGuard`/
`TenantContext` already built to the point where adding a UI later is
additive, not a redesign. Where a plan task calls for a UI-only artifact
with no backend equivalent (Task 26's tooltip metric definitions, Task 27's
Playwright smoke test of the embedded app), the backend or benchmark
delivers the closest UI-independent equivalent (a `definitions` field in
the API response; a load benchmark against the API layer instead of a
browser test) rather than skipping the requirement's *intent* entirely.

## Consequences

- Task 27's literal "Playwright smoke test: embedded app route renders" is
  not achievable — there is no route to render. Playwright is not currently
  a dependency of this repo; it can be installed and used as soon as a UI
  exists to test.
- M8's Gate M8 checklist item "90-second demo is reproducible" and the demo
  script (Task 31) describe the golden path through the operator API and
  Shopify's own admin UI, not a FulfillFlow-hosted screen — accurate to
  what exists, not a claim the demo script should paper over.
- Reversing this decision (building `apps/shopify-web`) is a product-scope
  call for the user to make explicitly, not something a future milestone
  session should do as an implicit side effect of "finishing" a task that
  assumes the UI exists.
