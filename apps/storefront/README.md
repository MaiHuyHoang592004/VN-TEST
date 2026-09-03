# storefront — the public website (Next.js, Shopify-style)

Anyone can visit, no login needed. Customers browse products and place orders.
This is the surface that grows: SEO pages, product pages, cart, checkout.

**Stack:** Next.js (App Router). Deploys to Vercel. Uses shared logic from `libs/db` and shared types from `libs/shared`.

## What goes where

```
src/
  app/                 Next.js App Router — each folder is a URL.
    page.tsx           the home page  (/)                        ← added when we build
    products/          product list (/products) + detail (/products/[id])
    cart/              the shopping cart page (/cart)
    checkout/          checkout + payment (/checkout)
    api/               Route Handlers = this site's backend endpoints.
                       e.g. api/checkout, api/webhooks/stripe (customer payments)
  components/          reusable UI (product card, cart drawer, buttons)
  lib/                 helpers + data fetching; calls into libs/db on the server
```

> The customer→seller payment (storefront checkout) is the "merchant of record" /
> Stripe-Connect question we flagged. Decide that model before wiring `api/webhooks/stripe`.
