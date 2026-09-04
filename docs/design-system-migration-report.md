# GoodWoodPrint design-system migration — report

**Branch:** `ds/layer-4-pages` · **Baseline:** `27f3794` · **Layer 4 range:**
`f08469d..8e6591d` · **Date:** 2026-09-04

This closes the migration `docs/superpowers/plans/2026-09-03-gwp-ds-migration.md`
opened. Layers 0–3 landed in an earlier session and are described in
`docs/MIGRATION-STATUS.md`; that document's central caveat — *"Nothing has been
verified visually. Nothing at all."* — no longer holds. Every claim below marked
**verified** was seen rendered in a browser against the seeded local database.

---

## 1. What changed in Layer 4

| Task | Screens | Commit |
|---|---|---|
| 19 | Home — the three role dashboards | `663538b` |
| 20 | Orders — the reference migration | `e4e4260` |
| 21 | Tickets list + conversation | `149bb9a` |
| 22 | Catalog | `8db91b5` |
| 23 | Inventory — stock, movements, receipts | `0bae1d6` |
| 24 | Fulfillment — the monitor board | `6f95364` |
| 25 | The twelve admin CRUD screens | `0cf6abf` |
| 26 | Profile, wallet, notifications, invite, login | `8e6591d` |
| — | **Layer 3 repair** — desktop navigation | `f08469d` |

90 files changed, +1,466 / −850.

### The load-bearing outcome

Before Layer 4, twelve files decided a status colour with a local ternary or a
variant map. **There are now none**, and the adherence gate has a check that
fails the build if one comes back:

```
== status rendered as anything but StatusBadge (must be empty) ==
ok
```

Every status in the app — orders, tickets, receipts, transactions, BOMs,
products, variants, users, warehouses, vendors, materials, mockups, shipments,
the monitor board and the mobile order card — resolves through
`STATUS_TONES`. Things that are **not** statuses (ticket priority, movement
type, transaction type, expense type, audit sensitivity, BOM coverage) carry an
explicit tone and never touch `toneFor()`, because the map is deliberately
closed against them and each would otherwise render grey.

---

## 2. Per-page interaction parity

The spec's definition of done. "Inventory" is the interaction count taken from
the code before touching it; "verified" is what was exercised in a browser.

| Task | Screen | Inventory | Verified | Notes |
|---|---|---|---|---|
| 19 | Home | 4 | 4/4 | role split at all three roles; period control re-queries (orders 19 → 0 on `?period=today`) |
| 20 | Orders | 26 | 22/26 | see below |
| 21 | Tickets | 6 | 5/6 | reply posting not exercised (would write to the seed data) |
| 22 | Catalog | 4 | 4/4 | grid, list, view toggle, search |
| 23 | Inventory | 6 | 4/6 | the two write dialogs (adjust, import) not exercised |
| 24 | Fulfillment | 3 | 2/3 | monitor filters + board; the station's scan flow needs a barcode |
| 25 | Admin (12 routes) | 22 gates, 13 tables, 20 `<Can>` | gates 22/22, routes 4/12 | see below |
| 26 | Profile/wallet/etc | 8 | 6/8 | see below |

### Task 20 — the four Orders interactions not ticked

1. **`/orders/print`** — the sheet calls `window.print()` on load by design,
   which blocks an embedded browser. Its change is one ink token and a mono
   quantity; it builds. Needs a human with a print preview.
2. **Date filter (`from`/`to`)** — **FINDING, not a regression.** The page reads
   `from`/`to` for `orderStatusSummary`, but the table renders no control that
   sets them. The filter is reachable only by editing the URL. Adding one would
   be adding a feature.
3. **Customer/warehouse filter (`?customer=`)** — same shape: `listOrders` and
   `orderStatusSummary` both accept `warehouseId` from it, `warehouses` is
   passed to `OrdersTable`, and the only consumer is `AssignDialog`. No filter
   control exists.
4. **Row click** — the spec's list includes it; this table sets no
   `onRowClick`. Tickets and receipts do.

### Task 25 — what "gates 22/22" means

The plan's Step 5 proof, run:

- the raw `can("…")` grep differs from the baseline by **one line number**,
  shifted by an added import;
- the sorted permission strings are **identical**;
- the 20 `<Can permission="…">` sites **diff clean against HEAD**.

Four of the twelve routes were walked in a browser (users, transactions, boms,
expenses) as an admin. The remaining eight were not, and the plan explicitly
says *"do not sample"* — so this is the largest gap in the verification, and it
is stated plainly rather than rounded up. The eight are homogeneous with the
four and share the same header, badge and toolbar changes.

### Task 26 — the sign-in paths

Email+password was signed out of and back into successfully after the login
screen was rebuilt. **Google OAuth and the email-OTP path were not exercised** —
OAuth needs a real Google round-trip and the OTP needs a mailbox (or the
`AUTH_OTP_CONSOLE=1` terminal path). Neither `auth-actions.ts` nor the OTP slot
component was modified, so the risk is presentational only, but they are not
ticked.

---

## 3. The Layer 3 bug this session found and fixed

`docs/MIGRATION-STATUS.md` §1.2 named the 768–1024px navigation as the highest-
value unverified check. **That fix works** — the hamburger is present at 900px.

The bug was one breakpoint further out. Task 16 removed the persistent 240px
rail and made the sheet the sidebar's only mode, but `SidebarNavButtons` kept
`lg:hidden` and `SidebarProvider` still decided from a media query whether the
sheet mounts. Above 1024px the opener was gone, the sheet never mounted, and the
desktop branch renders off-canvas — so **a signed-in desktop had no navigation
at all**. On `/` the nav was literally empty: `NavTabs` returns null on a route
with no section, and the logo and inline links sit in a `!user` branch.

Fixed in `f08469d`: `isMobile` is a constant, its opener carries no breakpoint,
and the sheet is `w-screen sm:w-(--sidebar-width)` at 20rem so a phone keeps the
full-screen menu and a desktop gets a drawer instead of a cream page. Verified
at 900px and 1440px.

---

## 4. Corrections made to the plan

The plan was written before the code was read closely. Layers 0–3 found six
errors (`MIGRATION-STATUS.md` §5). Layer 4 found five more.

| # | Error | Why it mattered |
|---|---|---|
| 7 | `t("home.greeting", { name })` | `t()` takes a key and nothing else. Interpolation in this codebase is `.replace("{name}", …)`, the shape `home.seller.openTickets` already uses. |
| 8 | `user.displayName` | `SessionUser` has `name`. |
| 9 | "`t()` must come from the server-side i18n entry the other server pages use" | **There is no server-side `t()`.** Every string comes from the `useTranslation` context, so a server page cannot build its own title. Every hero in Layer 4 is therefore a small client component that the server route renders — which also kept `app/page.tsx`'s auth branch untouched, as the plan separately required. |
| 10 | The `ProductCell` snippet | White well, no `meta`, `thumbnail` as a string. `ProductCell.d.ts` says *cream* well, documents `meta` as the variant-name line, and types `image` as a node. `MIGRATION-STATUS.md` §5 had already flagged this; the snippet was never corrected. Built to the `.d.ts`. |
| 11 | `MetricCard` + `toneFor()` | `MetricCard` had six tones, `StatusTone` has seven — `info` was missing, so `toneFor()` could not be handed to it at all. Added. |

---

## 5. Findings — reported, not reconciled

Each of these is a real defect found while migrating the screen it lives on.
None was fixed, because each is data-layer or product logic and the migration's
rule 1 makes logic immutable.

1. **The catalogue labels every SKU with the PRODUCT's name.** A product with
   three variants renders three identical pills.
   `libs/db/src/access/selects.ts:110` — `SKU_SELECT` selects `product` and
   never `variant`, and `catalog/page.tsx` maps `variantName: s.product.name`.
   `ProductVariant` is documented in the schema as "Product × Variant" and has
   both relations; `Variant.name` is the axis value. This is the same
   `product ↔ variant` swap `MIGRATION-STATUS.md` §3 documents — a mapping that
   type-checks and renders the wrong data. One other consumer
   (`listSkusForProduct`), so the blast radius is small.
2. **Orders has no date filter and no customer filter UI** (§2 above).
3. **`monitor.ts:88` references `b.column` unquoted in raw SQL** — carried over
   from `MIGRATION-STATUS.md` §6, still unfixed, still needs a human.
4. **The catalogue payload carries no stock state**, so the plan's
   `In Stock` / `Low Stock` / `Out Of Stock` badge has nothing to read. Adding
   one would mean inventing a field.

### Two things that WERE fixed, and why

- **`inventory.suppliers.types.*`** — the stock table printed the raw key
  `inventory.suppliers.types.SEMI_FINISHED` on screen. The `material ↔ supplier`
  find-and-replace renamed the `t()` read but not the locale files, which still
  carry `materials`. The locale settles it (same five enum values), it was the
  only call site, and it was a visible broken string on a page being migrated.
  This is a repair, not a design change.
- **`stat-tiles`' `value > 0` guard** silently discarded the caller's tone on a
  **negative** figure. The expenses panel passes
  `net < 0 ? "critical" : undefined` and its net rendered grey — contradicting
  the comment directly above it, which claimed "a negative net reads red". Now
  `value !== 0`. Found by looking at the rendered page.

---

## 6. Components that had no call sites, and now do

`MIGRATION-STATUS.md` §1.1 listed ten ported components that compiled but were
never rendered. After Layer 4:

| Component | Call sites |
|---|---|
| `StatusBadge` | 20+ across every table, card and detail panel |
| `MetricCard` | home ×3, orders strip, inventory tiles, BOM tiles, vendors, expenses, billing |
| `Surface` | seller/warehouse home, tickets thread + sidebar, catalog, receipts, monitor, `SettingsCard` |
| `SectionHeading` | `SettingsCard` (all five profile tabs) |
| `KeyValueRow` | ticket sidebar, receipt detail |
| `ProductCell` | orders, catalog list, stock, movements |
| `FilterChip` | the Orders tab strip |
| `SearchField` | admin home, catalog |
| `DateRangeField` | **still none** — see §7 |
| `ChartFrame` | **still none** — see §7 |

---

## 7. Open items

- **`ChartFrame` and `DateRangeField` have no call sites.** Not an oversight:
  the app renders exactly one `recharts` chart family, and none of it is on a
  Layer 4 screen — home's status shares and the floor's rankings are one `div`
  and a width, deliberately. `DateRangeField` has nowhere to go until Orders
  grows the date filter that finding §5.2 describes. Both are correct ports
  waiting for a consumer; neither should be deleted.
- **The zero-fill hazard did not arise.** `BE_ALIGNMENT.md` warns that backend
  chart series are not zero-filled. No Layer 4 screen renders one of those
  series, so no client-side zero was invented.
- **Dark mode** stays as Layers 0–3 left it: `.dark` neutralised and unreachable
  via `forcedTheme="light"`, nothing deleted, so a future GWP dark palette is
  one CSS block.
- **`VERIFY.md` and `A11Y.md` were not run as formal passes.** Their per-screen
  checklists were not worked against `docs/design-system/screenshots/reference/`
  screen by screen. What was done instead is stated in §2: each migrated screen
  was opened, and the DS's own per-screen rules (hero tone and ink, one Craft
  Cut, mono for ids/SKUs/tracking/money, display face only in titles and KPI
  numerals, the sky → shell → white ladder) were checked by eye. That is weaker
  than VERIFY.md and is not claimed to be equivalent.
- **The 84 database-backed tests still have not run** here. The 48 runnable
  tests pass.
- **`DESIGN-VERCEL.md` is now `DESIGN-VERCEL.ARCHIVED.md`** with a header
  saying so, and the root `CLAUDE.md` points at `docs/design-system/` instead.
- **No dead tokens were left to delete.** The Step 2 sweep for `vercel-*`,
  `gradient-*`, `brand-mesh`, `grid-line`, `ease-geist` and `gray-alpha-*`
  returns zero references and zero CSS lines — Layers 0–3 had already removed
  them. `--shadow-ds-*` and the `--text-display-*` / `--text-body-*` scale still
  have live call sites and are aliases onto GWP values, so they stay.

---

## 8. The gate

`bash apps/dashboard/scripts/check-ds-adherence.sh` — now **eight** checks,
three of them added here because they only became meaningful once the pages
were recomposed:

```
hex / rgb / oklch literals in components           ok
surviving Vercel brand tokens                      ok
Tailwind default palette next to GWP ramps         ok
neutral steps GWP does not define                  ok
backend metadata palette read for chrome           ok
status rendered as anything but StatusBadge        ok   ← new
pages hand-rolling the operational page container  ok   ← new
display face used outside titles/KPIs              informational   ← new
ADHERENCE: PASS
```

The second new check is anchored to `<main … max-w-7xl>` rather than
`max-w-7xl` alone, on purpose: the fulfillment station's sticky action bar is a
`<div>` that matches the page width deliberately, and the auth, invite,
forbidden and coming-soon screens are centred full-height compositions that are
**not** operational pages and must not be forced into `<Page>`.

Full status: adherence 8/8 · `tsc --noEmit` 0 errors · lint 0 errors, 7
pre-existing warnings · production build all routes · 48/48 runnable tests.
