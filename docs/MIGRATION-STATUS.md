# GoodWoodPrint design-system migration — status at handover

**Branch:** `main` (was `ds/gwp-migration`) · **Baseline:** `27f3794` · **Date:** 2026-09-04

Layers 0–3 of a 4-layer migration are complete. **Layer 4 was not started.**
This document is the honest account of what was done, what was not, and what
nobody has verified.

---

## 1. Read this first — three things that are NOT done

### 1.1 Layer 4 (page composition) — not started

Tasks 19–26 of the plan. The 32 routes still have their original layout. They
render with GWP colours, type, controls, surfaces and shell, because those come
from the layers below — but no page has been recomposed into
`<Page><PageHeader/><PageToolbar/><DataTable/>`, and `StatusBadge`,
`MetricCard`, `Surface`, `SectionHeading`, `KeyValueRow`, `ProductCell`,
`FilterChip`, `SearchField`, `DateRangeField` and `ChartFrame` **have no call
sites**. They compile; nothing renders them.

Task 27 (final adherence sweep, dead-token removal, retiring `DESIGN-VERCEL.md`
as the design authority, and the migration report) is also not done.

The plan for all of it is in
`docs/superpowers/plans/2026-09-03-gwp-ds-migration.md` — 27 tasks, ~300
checkbox steps, with the code to write. It has been corrected in six places as
implementers found errors in it (see §5).

### 1.2 Nothing has been verified visually. Nothing at all.

No agent in this session could open a browser. **Every claim about how the app
looks is inference from code, not observation.** The full list of unverified
checks is in §4. The single highest-value one:

> The 768–1024px navigation fix. Removing the sidebar rail left tablet widths
> with no way into the navigation; a fix landed, but **no run has confirmed a
> hamburger actually appears at 900px**. Check this first.

### 1.3 84 database-backed tests have never run

This machine has no Postgres. The 48 tests that do run (unit/pure-logic) pass.
The 84 that don't are exactly the ones covering the Prisma accessor and relation
fixes from the source repair (§3). **Run them against a real database before
trusting that repair.**

```bash
node --test apps/dashboard/src/modules/inventory/*.test.ts
node --test apps/dashboard/src/modules/catalog/product-variants/*.test.ts
node --test apps/dashboard/src/modules/finance/expenses/expenses.test.ts
```

---

## 2. What was done

31 commits · 443 files changed · +13,919 / −1,723 · 17 new design-system files.

| Layer | Tasks | Outcome |
|---|---|---|
| **Repair** | 0a–0b | The source did not build. Fixed. See §3 |
| **0 — Foundation** | 1–2 | GWP token layer behind the shadcn semantic tokens; canonical status→tone map with tests |
| **1 — Primitives** | 3–7 | Button, Badge/StatusBadge, Input/Textarea, Select/Checkbox, and a 36-component Group C sweep |
| **2 — Composite** | 8–14 | Surface/Card/SectionHeading/KeyValueRow, MetricCard, Table/DataTable, toolbar/search/chips/pagination, Modal/Drawer, Tabs + feedback states, DateRange/Charts |
| **3 — Shell** | 15–18 | `Page` primitives + Craft Cut + brand marks, sky page ground, the floating cream TopNav, admin bar chrome and warehouse workstations |
| **4 — Pages** | 19–26 | **NOT STARTED** |
| **Close-out** | 27 | **NOT STARTED** |

### The load-bearing property

**Layers 0–2 changed zero files under `src/components/pages/` or `src/app/`** —
verified with `git diff --name-only`. Roughly 100 files re-skinned without one
being opened. That was the point of the layering: the token layer repoints what
`bg-background` and `text-muted-foreground` mean, and every consumer inherits it.

Layer 3 lifted that rule deliberately, and only for the shell.

### The DataTable guarantee

`DataTable` is the surface behind **17 tables**. Its API did not move. Proven by
masking every string literal in the file and diffing the rest:

```
LOGIC IDENTICAL OUTSIDE STRING LITERALS: True
```

The original check (grep for lines containing `className`) had a hole — four
`cn(...)` continuation lines slipped through it. The implementer noticed and
replaced it with the stricter one rather than reporting a pass against a weak
check.

---

## 3. The source was corrupted before any of this began

`npx turbo run build` **failed on the pristine baseline**. Not an environment
problem: a global find-and-replace committed upstream had swapped four word
pairs across import paths, Prisma model accessors, field accesses, identifiers
and Tailwind class names — while leaving filenames correct.

```
row ↔ column · product ↔ variant · warehouse ↔ customer · material ↔ supplier
```

All three local zips are byte-identical (`md5 dd172066a88c…`), so the damage is
committed upstream, not an extraction artifact.

`tsc --noEmit` reported **168 errors** once module resolution was restored. The
worst class was invisible to both the build and the type checker: **swapped
Prisma model accessors** (`db.variant` where `db.product` was meant) and
**swapped field mappings that type-check and render the wrong data** — e.g.
`customerName: o.warehouse?.name` at `orders/page.tsx:90`.

Repaired against the Prisma schema as the sole oracle, with a standing rule that
anything the schema could not settle was left untouched and reported rather than
guessed. Details: `docs/superpowers/MANGLED-SOURCE-REPORT.md`.

**Consequence for this repo:** the branch contains both the repair and the
migration. If you want them separately, the repair is `27f3794..fbe3c04`.

---

## 4. Unverified — the complete list

None of these was run. None passed, none failed.

**Highest value first**

1. **768–1024px navigation.** A hamburger must appear at e.g. 900px and open the
   nav sheet. The fix added a second hook (`useIsBelowDesktop`, 1024) rather than
   moving `MOBILE_BREAKPOINT` (768), because that same hook drives DataTable's
   card-vs-table switch. Untested — a `matchMedia` hook needs a browser.
2. **The shell.** No rail at desktop; sky page ground; cream nav pill floating
   with sky visible around it; exactly one Action Blue element in the nav; active
   section tab is a pale sky pill; 390px dock clears and routes; signed-out login
   and footer.
3. **DataTable's nine behaviours.** Sort cycle asc→desc→none; `aria-sort` on the
   `<th>`; row select turns pale sky; select-all survives paging; row click fires
   but checkbox click does not; zero results shows the empty state not skeletons;
   phone width swaps to cards with a working checkbox; horizontal rules only, no
   grey header band, 48px header / 56px rows.
4. **Toolbar and pagination, eight points.** Debounce fires once after ~300ms;
   clear (×) resets; toolbar horizontal from `sm`; page-size change re-queries and
   resets; arrows disable at the ends; selection swaps the count text and bulk
   actions; ⌘K palette arrows + Enter; the new 40px alignment.
5. **Type.** Card, dialog, sheet and drawer titles actually rendering in Baloo 2
   (a `--font-heading` indirection bug was found and fixed; the fix is unverified).
6. **Everything else.** Modal navy scrim and focus trap; drawer directional
   shadow; tab underline; toast surfaces; skeleton `prefers-reduced-motion`;
   calendar range; chart grid; every `StatusBadge` appearance including dot
   alignment and pulse; inset field look; popup parity across the four families;
   two fulfillment rows that changed from a 5% tint to a solid wash and will read
   noticeably louder.

---

## 5. Errors found in the plan itself

The plan was written before the code was read closely. Implementers caught six
errors in it; all are corrected in the plan file, and each is worth knowing
because the same reasoning may apply elsewhere:

| # | Error | Why it mattered |
|---|---|---|
| 1 | Told implementers the variant prop was named `product` and never to "fix" it | That name was itself vandalism damage. The plan enshrined the corruption as intent |
| 2 | Told them to delete the `--text-display-*` / `--text-body-*` keys | 29 live call sites; Tailwind v4 drops unknown utilities silently, so it would have been 29 invisible regressions |
| 3 | Contrast floor assumed a white ground | The migration made the ground **sky**. navy-500 is 3.64:1 there — below the floor — across 374 uses |
| 4 | `text-orange-500` in the mapping table | orange-500 is a fill token; as text it is 2.50:1 |
| 5 | `ProductCell` spec omitted `meta` and used a white well | `ProductCell.d.ts` opens "cream thumbnail well" and documents `meta` as the variant-name line |
| 6 | Specified `GwpMark tone="navy"` for the nav | The DS says navy "pulls the brand toward SaaS/admin" — the exact failure this migration reverses |

---

## 6. Pre-existing bugs this migration surfaced

None were in scope. All were found by reading each layer closely.

| Bug | Effect |
|---|---|
| `dropdown-menu`, `context-menu`, `menubar` used dead `focus:` selectors instead of Base UI's `data-highlighted` | Three menus had **never** had a working hover/keyboard highlight |
| `command.tsx` used a bare `data-selected:` modifier | Bare matches attribute *presence*, and cmdk always emits `"true"` or `"false"` — so **every search result rendered as selected** |
| `sm:flex-column` in the toolbar and pagination | Not a Tailwind class; both bars had been stacking vertically at **every** breakpoint |
| 66 dead `t()` keys and a dead `/admin/suppliers` route | Broken at runtime |
| `monitor.ts:88` references `b.column` unquoted in raw SQL | `column` is reserved in Postgres; the physical column is `"column"`. **Looks broken pre-migration — not fixed, needs a human** |

---

## 7. Deliberately not done — these need a human decision

| Item | Why it was left |
|---|---|
| ⌘K cannot find a SKU by its **product key** | Changing it alters *what users can find* — that is business logic, and rule 1 says logic is immutable |
| `permissions.ts` names: `orders.read.customer` should be `.warehouse`, `suppliers.manage` should be `materials.manage` | Self-consistent and inert at runtime, but it is the security-policy file and rule 5 makes it the most sensitive in the repo |
| Audit `targetType: "customer"` | **Persisted in `audit_logs`.** Changing the code without a data migration orphans every existing row |
| `?customer=` query param on 5 routes (29 sites) | Renaming breaks existing bookmarks for a cosmetic gain |
| ~600 bare `column` identifiers meaning "row" | Cosmetic, needs per-site judgment, and a diff that size would drown the migration |
| `TicketPriority`, `InventoryMovementType.RETURN`, `Shipment.trackingStatus` | Deliberately outside the tone map — each would render grey if routed through `toneFor()`. Documented in `status-tones.ts` |
| `RESOLVED` → success, `ASSIGNED` → neutral | Both flagged in-file as **awaiting design-system ratification**. `RESOLVED` is inference, not restatement |
| Dark mode | The DS ships no dark palette. `.dark` is neutralised and made unreachable via `forcedTheme="light"`; nothing was deleted, so a future GWP dark palette is one CSS block |

---

## 8. Traps for whoever continues

1. **`.prettierrc` does not match the committed source.** It sets
   `singleQuote: true`; the source uses double quotes. Running prettier rewrites
   every quote and rewraps hundreds of lines per file. Do not run it casually —
   one implementer hit this, discarded the result and re-applied its work by hand.
2. **Base UI, not Radix.** Compose with `render={<El />}`, never `asChild`.
   Non-button renders on `Button` need `nativeButton={false}`. Item highlight is
   `data-highlighted`. Guessing a state attribute produces a control with no
   visible active state and **nothing fails or warns** — this bit three separate
   components already.
3. **The adherence gate is real and has teeth.** `bash
   apps/dashboard/scripts/check-ds-adherence.sh` — 5 checks over `.tsx`, `.ts`
   and `.css`. It has been strengthened three times by things it caught. If it
   flags you, the code is wrong; do not add an exclusion.
4. **`toneFor()` has an enum-coverage test that reads `enums.prisma` at test
   time.** Add an enum or a value and it fails until you make a decision. That is
   deliberate: a status must never render grey by accident.
5. **`public/Geomatric/*`** (the old logo) is still referenced by
   `[...comingSoon]/page.tsx`. It can be deleted once that page is migrated.

---

## 9. Commands

```bash
npm install && npm run db:generate -w @gwprint/db
npm run dev -w @gwprint/dashboard
```

Full gate, all five must pass:

```bash
bash apps/dashboard/scripts/check-ds-adherence.sh
npx turbo run lint --filter=@gwprint/dashboard
(cd apps/dashboard && npx tsc --noEmit)
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@gwprint/dashboard
node --test apps/dashboard/src/components/ds/status-tones.test.ts apps/dashboard/src/config/nav-tabs.test.ts apps/dashboard/src/lib/time-period.test.ts apps/dashboard/src/components/pages/orders/import-columns.test.ts
node --test libs/shared/src/access/permissions.test.ts
```

Status at handover: **all five pass** — adherence PASS (5/5) · lint 0 errors
(7 pre-existing warnings) · tsc 0 errors · build all routes · 48/48 runnable
tests.

---

## 10. Where things live

| Path | What |
|---|---|
| `docs/design-system/` | The vendored GWP design system — rulebook, 401 tokens, per-component `.d.ts` and `.prompt.md`, screen manifest, 63 reference PNGs. **Read-only**, another project's artifact |
| `docs/superpowers/plans/2026-09-03-gwp-ds-migration.md` | The 27-task plan, corrected. Layer 4 lives here |
| `docs/superpowers/specs/…-spec.md` | The migration rules this plan argues from |
| `docs/superpowers/MANGLED-SOURCE-REPORT.md` | Every mangled site and its resolution |
| `apps/dashboard/src/app/gwp.theme.css` | Generated token sheet. Never hand-edit |
| `apps/dashboard/src/components/ds/` | The ported DS layer. Pages import from `@/components/ds` |
| `apps/dashboard/scripts/check-ds-adherence.sh` | The gate |
| `apps/dashboard/DESIGN-VERCEL.md` | **Stale.** The pre-migration Geist spec, still described as authoritative in `CLAUDE.md`. Task 27 was to retire it — it did not run, so it still misleads |
