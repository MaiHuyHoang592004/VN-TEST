# dashboard — each user's private control panel

The logged-in app. ONE app: after login a user sees ONLY their own data
(orders, products, wallet). "Their own admin panel" = this app scoped by login.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 ·
shadcn/ui `base-nova` (Base UI primitives) · lucide + Simple Icons ·
next-themes · @tanstack/react-query · Fuse.js

## Run

```bash
npm run dev -w @gwprint/dashboard   # from repo root — raw Next.js logs
npm run dev                            # or via Turbo TUI (all apps)
```

## What's implemented

- **Vercel/Geist theme** — dark default + light, pure black/white palette,
  brand tokens: `vercel-blue/purple/pink/cyan/green/yellow/red/orange`
  (use as `text-vercel-green`, `stroke-vercel-red`, `shadow-vercel-blue/25`, …)
- **Effect utilities** (globals.css): `text-gradient`, `bg-brand`, `grid-bg` +
  `radial-fade`, `hover-lift`, `gradient-border`, `btn-shine`, spotlight card
- **Navbar** — logo, Orders/Products links, Tools dropdown (neon brand-color
  icons on hover), hybrid search, login/signup, language selector, animated
  theme toggle; mobile bottom tab bar
- **Search** — hybrid: server API first, silently downloads full index, then
  instant client-side ranked + fuzzy (Fuse.js) search. ⌘K / F / arrows / Enter.
  Demo data in `src/lib/search-data.ts` (swap for Prisma via libs/db later)
- **Footer** — link columns, 18 social channels with per-brand neon hover
- **i18n** — 7 locales (en, zh, vi, ja, ko, fr, ar), context-based, in
  `src/lib/i18n` (no URL prefixes yet; upgrade path noted in file)
- **Auth** — stub provider only (`user` always null). Real auth pending.

## Where things live

```
src/
  app/                    routes; app/api/search/* are the search endpoints
  components/
    ui/                   shadcn components (60) + ui/custom/ (spotlight-card)
    global/
      layout/navbar/      navbar + user menu + tools dropdown + language selector
      layout/footer/      footer + social row
      search/             hybrid search (components + hooks)
      providers/          AppProviders: theme, query, i18n, auth, tooltips
      theme/              ThemeProvider, animated ThemeToggle, Excel branding
  lib/
    i18n/                 provider, translations (7 locales), navigation
    search-data.ts        demo search index — replace with libs/db queries
  hooks/                  useLocalStorage, use-mobile
public/Geomatric/         logo mark (black/white)
```

## Conventions

- Base UI primitives use `render={<El />}` — NOT radix's `asChild`
- Style with semantic tokens (`bg-background`, `text-muted-foreground`);
  brand colors only via the `vercel-*` tokens; no `!important`
- Highlight styling on menu items: use Base UI's `data-highlighted`;
  color icons via `stroke-*` (immune to the item's focus color rule)
