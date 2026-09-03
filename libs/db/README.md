# db — the shared backend (database + business logic)

The real "backend" lives here, NOT in a separate server. Both Next apps
(`storefront` and `dashboard`) import this library so the rules are written once
and can't drift apart. Their `app/api/` Route Handlers are thin — they call in here.

**Not deployed on its own.** It's a library the apps bundle in. Runs server-side only.

## What goes where

```
prisma/              the database itself
  schema.prisma      the shape of every table (User, Product, Order, Transaction...)
  migrations/        its change history

src/                 the business logic, one folder per area:
  auth/              login, sessions, API keys, roles
  users/             accounts, profiles, wallet balance
  products/          catalog + variants
  orders/            create, assign to warehouse, track, fulfill
  warehouse/         inventory, stock, basket positions
  payments/          Stripe: create checkout, verify webhook, credit the wallet
  tickets/           support tickets tied to orders
```

> Two money flows both pass through `payments/`, keep them separate:
> 1) **wallet top-up** — a user pays us (clean).
> 2) **storefront checkout** — a customer pays a user (merchant-of-record / Stripe-Connect question).
