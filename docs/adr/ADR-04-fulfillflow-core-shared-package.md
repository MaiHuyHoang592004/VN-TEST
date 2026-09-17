# ADR-04: Cross-app business logic lives in @fulfillflow/core, not in either app

## Status

Accepted (M4), reaffirmed twice since (M5, M7).

## Context

`apps/api` and `apps/worker` are peer NestJS applications — `apps/api` is
the merchant/operator HTTP surface, `apps/worker` is a headless ingestion/
outbox processor — and neither imports the other's `src/`. Repeatedly,
business logic first written for one turned out to be needed, verbatim, by
the other:

- M4: `apps/worker`'s ingestion handlers need to route and reserve a
  newly-accepted order; `apps/api`'s operator commands (`start`,
  `complete-production`, `ship`) need the exact same reservation/consumption
  logic so a manual operator action and an automated one can never disagree
  about inventory state.
- M5: `apps/worker`'s Shopify sync handlers need `ShopifyTokenManager`;
  `apps/api`'s session bootstrap and webhook-adjacent code need the same
  token exchange/crypto, not a second implementation of either.
- M7: `apps/worker`'s order-acceptance path needs to *evaluate*
  `AutomationRule`s; `apps/api`'s new merchant CRUD needs to *validate* a
  rule's JSON with the identical schema before persisting it — a rule that
  passes validation must be exactly what the evaluator can parse, not a
  close cousin of it.

Each time, the plan's own file layout put the logic under one app's `src/`
tree, and each time that turned out to be wrong once the second consumer
appeared.

## Decision

Business logic with more than one real consumer across `apps/api` and
`apps/worker` lives in `libs/core` (`@fulfillflow/core`), a Prisma-dependent,
server-only, tsc-built package (built like `@fulfillflow/db`, not the
isomorphic `@fulfillflow/shared`). Both apps depend on it. Logic that only
one app will ever call (webhook HMAC verification, operator HTTP
controllers, the ingestion/outbox loop machinery itself) stays where it is
— this is not "put everything in core," only genuinely shared logic.

Two mechanical consequences of the package boundary, hit each time a move
happened and worth remembering rather than rediscovering:

- `libs/core`'s relative imports use `.ts` specifiers (its test runner is
  `node --experimental-strip-types`), not the `.js` specifiers `apps/api`/
  `apps/worker` use (`@swc-node/register`). A moved file's own imports need
  updating, not just its new location.
- `libs/core`'s test runner rejects TypeScript constructor parameter-
  property shorthand (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`) — classes there
  use plain field assignment instead.

## Consequences

- A new cross-cutting service should default to `libs/core` from the start
  once it's clear both apps will call it, rather than starting in one app
  and being moved later — the move itself is small, but has cost real
  session time three times now on the mechanical gotchas above.
- `libs/core` has no HTTP-framework dependency (no `@nestjs/common` import)
  and never will — it's a plain TypeScript library both NestJS apps happen
  to consume, not a shared NestJS module.
