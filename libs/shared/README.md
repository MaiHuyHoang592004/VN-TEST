# shared — code used by everything

Define things ONCE here so all three (storefront, dashboard, db) agree.
Change an order's shape in one place → every app updates together. No drift.

Safe to import anywhere (client or server) — types and plain values only, no database code.

## What goes where

```
src/
  types/         the shape of core things: User, Product, Order, Transaction
  constants/     shared fixed values: order statuses, and the Stripe metadata keys
                 we agreed on (txn_id, merchant_id, purpose) so front and back
                 never spell them differently
```
