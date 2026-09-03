# opcreative

Turborepo monorepo. 100% Next.js, built to run on Vercel.

Fulfillment platform for print-on-demand sellers: sellers get their own
dashboard (orders, products, wallet), customers get a public storefront.

## Structure

```
apps/
  dashboard/    Next.js — per-user private panel (orders, products, wallet)  ← BUILT
  storefront/   Next.js — public Shopify-style site (browse, cart, checkout) ← skeleton
libs/
  db/           Prisma + all backend logic BOTH apps share (the "backend")   ← skeleton
  shared/       types + constants used everywhere (incl. Stripe metadata keys) ← skeleton
```

Each folder has its own `README.md` explaining what goes inside.
`apps/` = things people visit (deployed). `libs/` = shared code the apps import (never deployed alone).

## Status

- **dashboard** — live app: Next.js 16, shadcn (base-nova), full Vercel/Geist theme,
  navbar + footer, i18n (7 locales), hybrid search, theme toggle. See
  [apps/dashboard/README.md](apps/dashboard/README.md).
- **storefront / libs** — planned structure only; built next.

## Tooling

- **Turborepo** runs and caches tasks (`dev`, `build`, `lint`) — TUI mode: task list
  left, clean per-app logs right.
- **npm workspaces** links the packages (see `workspaces` in `package.json`).
- Deploy target: **Vercel** — one Vercel project per app in `apps/`
  (Root Directory setting picks the app; apps deploy independently).

## Commands

```bash
npm install                          # install everything
npm run dev                          # run all apps (Turbo TUI)
npm run dev -w @opcreative/dashboard # run one app, raw Next.js logs (no Turbo)
npm run build                        # build all apps
npx turbo run build --filter=@opcreative/dashboard   # build one app
```
