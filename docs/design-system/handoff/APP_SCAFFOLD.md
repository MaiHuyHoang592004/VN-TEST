# App scaffold — the target FE (`FE-VN/`)

**Locked 2026-08-21.** These six were decided so Claude Code never has to guess or
re-ask. Everything here is *plumbing*: it says nothing about how a screen looks
(that is `readme.md` + the screen HTML) and nothing about what the API returns
(that is `BE_ALIGNMENT.md` + `types/domain.d.ts`).

| Decision | Locked value |
|---|---|
| Repo layout | pnpm workspace monorepo in `FE-VN/` |
| Language | TypeScript, `strict: true` |
| Server state | TanStack Query v5 |
| Auth | bearer token in `localStorage`, 401 → logout (no refresh — see `AUTH_AND_ROLES.md`) |
| Forms | react-hook-form + zod |
| Public/marketing app | own Vite entry, built **after** seller + admin |

## 1 · Workspace layout

```
FE-VN/
  pnpm-workspace.yaml
  package.json                 # root: scripts only, no app deps
  tsconfig.base.json
  CLAUDE.md                    # copy of handoff/TARGET_CLAUDE.md
  packages/
    ds/                        # the design system, ported (NOT imported from the kit)
      src/tokens/gwp.theme.css # copy of handoff/gwp.theme.css — regenerate, never hand-edit
      src/core/               Button IconButton StatusBadge
      src/forms/              Input Select SearchField SegmentedControl FilterChip DateRangeField
      src/data/               DataTable Surface MetricCard KeyValueRow ProductCell SectionHeading ChartFrame ShareBar WalletSummary
      src/navigation/         TopNav AdminBar TabBar Breadcrumb Pagination PageHero Sidebar
      src/feedback/           Modal Drawer Popover Toast Callout EmptyState LoadingState Skeleton CommandPalette TicketConversation SupportPanel
      src/brand/              GwpMark CraftCut WoodRings
      src/catalog/            CatalogHero ProductCard SearchShell
      src/marketing/          MarketingHero FeatureCard
      src/index.ts             # barrel: every component exported by name
    api/
      src/client.ts            # see API_CLIENT.md
      src/queries/*.ts         # one file per resource: orders, tickets, products, users, …
      src/types/domain.ts      # copy of types/domain.d.ts, as real .ts
  apps/
    seller/   src/{main.tsx,app.css,routes.tsx,shell/,pages/}
    admin/    src/{main.tsx,app.css,routes.tsx,shell/,pages/}
    public/   (stub only until seller + admin ship)
```

**Why a monorepo:** `packages/ds` and `packages/api` are consumed by both apps and
must not fork. A component fixed in seller must be fixed in admin by the same commit.

## 2 · The three apps

| App | Ground | Chrome | Roles | Screens |
|---|---|---|---|---|
| `apps/seller` | cream shell floating on sky | `TopNav` | `customer` | 14 (`ui_kits/seller-app/`) |
| `apps/admin` | white | `TopNav surface="white"`; warehouse stations use `AdminBar` | `admin` `supporter` `warehouse` `warehouse_admin` `warehouse_external` `designer` | 29 admin + 6 warehouse |
| `apps/public` | per marketing screens | marketing chrome | `public` | 4 (build last) |

Auth screens (`/auth/*`, `/error/*`) are built **twice**, once per app, from the same
`packages/ds` parts — they are the app's own front door, not a shared route.

Per-route detail (roles, shell, source HTML, components, `domainBound`) is in
**`handoff/routes.json`** — 49 routes, machine-readable, one entry per screen. The 8
entries under `nonRoutable` are deliberately not routes; do not invent paths for them.

## 3 · Dependencies (pin these exact majors)

```
react 18.3  react-dom 18.3  react-router-dom 6.28
@tanstack/react-query 5  @tanstack/react-table 8
react-hook-form 7  zod 3  @hookform/resolvers 3
lucide-react (icons — ICONS.md)  recharts 2 (chart engine inside ChartFrame)
vite 5  @vitejs/plugin-react  @tailwindcss/vite  tailwindcss 4
typescript 5  vitest + @testing-library/react  eslint + oxlint
```

**Do NOT install:** any UI kit (Metronic, shadcn, MUI, Ant, Chakra, Bootstrap), any
CSS-in-JS runtime, `moment`, `axios` (native `fetch` is enough — see `API_CLIENT.md`),
MSW or any mock layer (`BE_ALIGNMENT.md`: real backend from day one).

## 4 · Config

**`app.css`** (each app, imported once from `main.tsx`):

```css
@import "tailwindcss";
@import "@gwp/ds/tokens/gwp.theme.css";
```

That is the whole styling entry point. `gwp.theme.css` carries the Google Fonts
import, all 238 tokens and 163 utility mappings. **Never add a color outside it**;
when tokens change, regenerate from `tokens.json` in the design system and re-copy.

**`vite.config.ts`** per app: `react()` + `tailwindcss()` plugins; `server.port` 5173
(seller) / 5174 (admin) / 5175 (public); `resolve.alias` `@` → `src`.

**`tsconfig.base.json`**: `strict`, `noUncheckedIndexedAccess`, `paths` for
`@gwp/ds` → `packages/ds/src`, `@gwp/api` → `packages/api/src`, `@/*` → app `src/*`.

## 5 · Env

```
VITE_API_BASE_URL=          # backend origin, no trailing slash
VITE_APP=seller|admin|public
```

Committed as `.env.example` only. No secrets in the FE — the `x-api-key` on
`/admin/v1/*` is a server-to-server integration surface and **the FE never calls it**
(`BE_ALIGNMENT.md` §4).

## 6 · Provider tree (identical in both apps)

```
<QueryClientProvider>      queries: staleTime 30s, retry 1, refetchOnWindowFocus false
  <AuthProvider>           token + currentUser, see AUTH_AND_ROLES.md
    <ToastProvider>        ds/feedback/Toast
      <RouterProvider>     routes.tsx, built from handoff/routes.json
```

Route-level `<Suspense>` falls back to `LoadingState variant="brand"`
(`ui_kits/system/SystemLoader.html`), never a bare spinner. Route-level
`<ErrorBoundary>` renders `Callout tone="critical"` per `STATES.md`.

## 7 · Formatting — one module, `packages/api/src/format.ts`

Drift starts here, so these are the only formatters allowed:

- `formatMoney(value, currency)` — **currency comes from the field, never assumed.**
  The kit shows `$` on order cost/ship and `₫` on expenses because those screens'
  sources do; no endpoint returns a currency code today → **BACKEND_ASKS §7.3**.
  Until it answers, each screen passes the currency its README documents. Never
  convert between currencies client-side.
- `formatDate(iso)` / `formatDateTime(iso)` — display in the **user's local zone**;
  send ISO 8601 UTC. No relative "3 hours ago" unless the screen's README asks.
- `formatQty`, `formatPercent` — plain, no rounding that changes a business figure.
- Never format a number the API didn't return (standing rule 1, `BACKEND_ASKS.md`).

## 8 · Port order

1. `packages/ds` tokens + `core` + `forms` + `navigation` + `data` + `feedback`
   (in that order — `catalog`/`marketing`/`brand` come with their first consuming screen).
2. `packages/api` client + auth + `types/domain.ts`.
3. Screens, per `handoff/BUILD_PLAN.md`.

Each ported component keeps its kit prop contract verbatim (`components/**/*.d.ts`),
including `DOMAIN-BOUND` annotations as TS comments. `examples/golden-path/README.md`
is the worked before/after for one screen — follow its shape.
