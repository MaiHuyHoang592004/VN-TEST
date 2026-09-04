# opcreative — Turborepo monorepo (100% Next.js, deploys on Vercel)

Fulfillment platform for print-on-demand sellers. Structure:

- `apps/dashboard` — per-user private panel (BUILT: Next.js 16, shadcn base-nova skinned to the GoodWoodPrint design system)
- `apps/storefront` — public Shopify-style site (skeleton, not built yet)
- `libs/db` — Prisma + shared backend logic (skeleton) · `libs/shared` — shared types/constants (skeleton)
- `.archive/` — legacy projects, LOCAL ONLY (gitignored, each its own git repo). Never commit or scan it.

## Two remotes: private WIP vs team

One local folder, two GitHub repos (set up 2026-07-21, seeded by `git push --mirror`
so history is identical — commits/branches/tags only; GitHub PRs and issues do NOT copy):

- `origin` → `niyamvora/opcreative` — **private**, Niyam only. Default for all daily work.
- `team` → `niyamvora/opcreative-team` — **shared** with collaborators. Publish here deliberately.

```bash
git push origin phase-2-backend   # normal work, stays private
git push team main                # publish: same commits, no copy-paste, no cherry-pick
```

**Strictly one-way.** `origin` is the source of truth; `team` is a publication
target that is only ever pushed to, never pulled from. Caveat: `team` is a
personal-account repo, where **every collaborator gets write access** — read-only
roles and rulesets both need an org (Read role is free; rulesets need Team plan).
So one-way is convention, not enforcement, until `opcreative-team` moves to an
org. If a `push team` is ever rejected, a teammate pushed: do NOT `--force` (it
silently deletes their commits) — look at what landed first. Never copy files
between clones. Vercel is still linked to `origin`
(`opcreative`) — move the deploy hook if `team` becomes the release source.

## Commands

```bash
npm run dev -w @opcreative/dashboard   # one app, raw Next.js logs (preferred for dev)
npm run dev / build / lint             # all apps via Turbo (TUI mode)
npx turbo run build --filter=@opcreative/dashboard
```

Deploy: `vercel deploy --prod --yes` from the **repo root** (workspace libs must
upload too; project `opcreative-dashboard` has rootDirectory=apps/dashboard,
live at opcreative-dashboard.vercel.app). `.vercelignore` keeps uploads under
the 100 MB limit. One Vercel project per app. Prod DB: Neon (free, via Vercel
Marketplace, resource `opcreative-db`) — deliberately generic Postgres; moving
to DigitalOcean later = swap DATABASE_URL in Vercel env + both `.env.prod`
files, nothing else. Prod migrations: `npm run db:migrate:prod` from `libs/db`
(uses the direct/non-pooled URL in its `.env.prod`).

## Database (`libs/db` → `@opcreative/db`)

- Prisma 7 multi-file schema (native — no build scripts):
  `prisma/schema/main.prisma` (generator+datasource), `prisma/schema/enums/`,
  `prisma/schema/models/*.prisma` (one per model), config in
  `prisma/config/prisma.config.ts`, migrations in `prisma/migrations/`.
- **NEVER `prisma db push` or `prisma migrate reset`.** Schema change = edit
  models → `npm run db:migrate -- --name <change>` (from `libs/db`) → commit
  the migration. Prod: `npm run db:migrate:prod` (reads `.env.prod`).
- Local DB: `opcreative_local` on Homebrew Postgres 17; URL in `.env.local`
  (gitignored, as is `.env.prod` — Vercel gets DATABASE_URL from its env vars).
- Legacy cutover: `prisma/scripts/migrate-legacy.sql` runs on **prod only**
  (old data lives there; local starts fresh). Tested end-to-end 2026-07-20.
- Auth (`libs/auth` → `@opcreative/auth`): Auth.js v5, JWT sessions
  (Credentials provider requires JWT — do not switch to database sessions).
  Three sign-ins: Google OAuth, email+password (bcrypt in `passwordHash`),
  email OTP via Resend (signup verification + passwordless fallback).
  "/" renders login when signed out, dashboard home when signed in; the
  `(protected)` route group redirects to "/". `User.id` is a String cuid,
  everything else keeps Int autoincrement ids. Local test login:
  test@opcreative.dev / newpass9 (seeded in opcreative_local only).

## Conventions (learned the hard way — follow them)

- **Design spec**: `docs/design-system/` is the OFFICIAL GoodWoodPrint design
  system — read `SKILL.md` (the four rules, one page), then `readme.md` (the
  full rulebook) before building or polishing any UI. Tokens live in
  `apps/dashboard/src/app/gwp.theme.css` (generated); never add a colour
  outside it. Status colour comes only from
  `apps/dashboard/src/components/ds/status-tones.ts`, never from a local
  ternary and never from the backend's `metadata.ts` theme/color literals. Run
  `bash apps/dashboard/scripts/check-ds-adherence.sh` before committing UI
  changes. `apps/dashboard/DESIGN-VERCEL.ARCHIVED.md` is the pre-migration
  Geist spec — history, not authority.

- shadcn here uses **Base UI primitives** (`base-nova`), GWP-skinned in place,
  NOT radix: triggers/items
  compose with `render={<El />}` — never `asChild`. Non-button renders on Button
  need `nativeButton={false}`.
- Menu-item hover/keyboard state = `data-highlighted` (Base UI). Item's base class
  force-colors descendants via `focus:**:text-accent-foreground`; color icons with
  `stroke-*` utilities (immune to it). No `!important`, ever.
- Style with semantic tokens (`bg-background`, `text-muted-foreground`, …).
  Brand colors only via theme tokens `vercel-blue/purple/pink/cyan/green/yellow/red/orange`
  (usable as `text-*`, `stroke-*`, `shadow-*`, …). Effects utilities live in
  `apps/dashboard/src/app/globals.css` (`text-gradient`, `grid-bg`, `btn-shine`, …).
- i18n: 7 locales (en, zh, vi, ja, ko, fr, ar) in `apps/dashboard/src/lib/i18n` —
  every user-facing string goes through `t()`; add keys to ALL locales.
- Unbuilt routes are covered by the `[...comingSoon]` catch-all page; a real
  `page.tsx` at any path automatically overrides it.
- Search data is a demo dataset (`src/lib/search-data.ts`) behind `/api/search` —
  swap to Prisma via `libs/db` when the database lands; keep the API contract.
- Money/Stripe design decisions live in the schema discussion: one Stripe account,
  merchant mapping via `txn_id` metadata + pending-transaction row; never trust
  webhooks without signature verification + idempotency.

## Environment quirks

- `git push` in this sandbox transfers fine but hangs after (~2 min timeout):
  run it backgrounded, then verify with `gh api repos/niyamvora/opcreative/commits/main`.
- History was rewritten (2026-07-18) to purge `.archive`; old clones must re-clone.
