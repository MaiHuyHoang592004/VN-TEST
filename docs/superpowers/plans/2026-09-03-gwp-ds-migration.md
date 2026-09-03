# GoodWoodPrint Design System Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin `apps/dashboard` (32 routes) onto the GoodWoodPrint Fulfillment Design System without changing a single line of business logic, route, permission check or form schema.

**Architecture:** Four layers, bottom-up. A GWP token layer is installed *behind* the existing shadcn semantic tokens, so `bg-background` / `text-muted-foreground` / `bg-primary` resolve to GWP colours and the whole app re-skins before any component is edited. Then each primitive in `src/components/ui/*` is re-implemented **in place** — same file, same exports, same prop names — so its call sites (68 files for Button alone) inherit GWP looks with zero page edits. Composites and the app shell follow. Only in Layer 4 do pages change, and then only their spacing, grouping and hierarchy. Where the DS API differs from ours, we adapt the DS *into* our signature (rule 9), never the reverse (rule 8).

**Tech Stack:** Next.js 16.2.10 (App Router, RSC), React 19.2.4, TypeScript 5, Tailwind CSS v4 (`@theme inline`), shadcn on **Base UI** primitives (`base-nova` — `render={…}`, never `asChild`), `class-variance-authority`, lucide-react, recharts, sonner, next-themes, `node --test` for pure-logic tests.

**Spec:** `docs/superpowers/specs/2026-09-03-gwp-ds-migration-spec.md`

**Design system source:** local export of Claude Design project `3276900d-15c6-4f7a-87c2-b81c69a606b7`, unzipped from `~/Downloads/GoodWoodPrint Fulfillment Design System1.zip` (561 files, dated 2026-08-21). Task 1 vendors the load-bearing parts into `docs/design-system/`.

---

## Global Constraints

Every task's requirements implicitly include this section.

### The ten migration rules (from the spec, verbatim)

1. Existing business logic is immutable.
2. Existing hooks should be reused.
3. Existing API/service calls should be reused.
4. Existing route paths must not change.
5. Existing permission checks must not change.
6. Existing form schemas must not change.
7. Existing event handlers must be passed into the new DS components.
8. Do not rewrite a working feature merely to match the DS API.
9. Use adapters when the DS interface differs.
10. A migrated page must preserve every previous interaction.

### Operational consequences — read before every task

- **Never edit anything under `src/modules/`.** That is the business layer (queries, server actions, guards). Out of scope for all 27 tasks.
- **Never edit** `src/hooks/use-permissions.ts`, `src/components/global/permission-gate/can.tsx`, `libs/shared/src/access/*`, any `zod` schema, or any `src/app/**/page.tsx` data-fetching body. A Layer 4 task may change a page's returned JSX wrapper (container / header / toolbar) only — never its `await`s, its `searchParams` parsing, or its props construction.
- **Keep every export name and prop name**, with ONE documented exception. The UI kit's variant prop was called `product` because the upstream mangle renamed it (`product`↔`variant` was one of the four swapped pairs); Task 0b restores it to shadcn's real name, `variant`, across 27 components, 14 `data-variant` attributes and ~132 call sites. From Task 1 onward the prop is **`variant`**. Add new variant *values*; never rename the prop again.
- **Base UI, not Radix.** Compose with `render={<El />}`, never `asChild`. Non-button renders on `Button` need `nativeButton={false}`. Menu item hover/keyboard state is `data-highlighted`. No `!important`, ever.
- **Port, don't import.** The DS `.jsx` files run only inside the design sandbox (`_ds_bundle.js`) and use inline styles. Port their markup, token values and prop contracts into Tailwind classes on our own components. Never add the DS as a dependency; never copy a `.jsx` file into `src/`.
- **No new colours.** Every colour comes from `docs/design-system/gwp.theme.css`. A hex literal in a component is a task failure.
- **Status colour** comes only from `src/components/ds/status-tones.ts` (Task 2). Never from backend `metadata.ts` theme/color literals, never a hand-picked badge variant.
- **Never invent domain vocabulary** — order states, roles, SKU/BOM rules, wallet semantics, production or shipping lifecycles. Where the DS marks a field DOMAIN-BOUND and our code has no real field, leave the documented placeholder.
- **i18n:** every user-facing string already goes through `t()` across 7 locales (`en, zh, vi, ja, ko, fr, ar`) in `src/lib/i18n`. New chrome strings go into **all seven**. Never translate enum values (`ORDER_STATUS`, `TICKET_REASON`, warehouse route names) — they are data.
- **Icons:** lucide-react is already the icon set, which is what the DS `ICONS.md` prescribes. No icon-library change anywhere in this plan.

### Exact token values (copied verbatim from the DS export — never re-derive)

| Token | Value | Duty |
|---|---|---|
| `--gwp-bright-sky` | `#ABDAEF` | THE PAGE. ~70% of an operational screen |
| `--gwp-warm-cream` | `#FFFDF0` | brand warmth in doses (~30%) — nav shell, marketing, product wells |
| `--gwp-information-navy` | `#0F3A5F` | eyebrows, subtitles, labels, data, controls |
| `--gwp-action-blue` | `#0078C1` | the one fill that clears 4.5:1 with white text |
| `--surface-shell` | `#FBFCFA` (`--neutral-50`) | DEFAULT operational surface — card shells, filter bars, panels |
| `--surface-data` | `#FFFFFF` | nested data / product zone |
| `--surface-nav` | `#FFFDF0` (`--cream-100`) | the floating cream navigation shell |
| `--surface-inset` | `#F4FBFE` (`--sky-50`) | inputs, wells, code blocks |
| `--radius-control` | `10px` (`--radius-sm`) | dense operational controls |
| `--radius-card` | `14px` (`--radius-md`) | cards and surfaces |
| `--radius-pill` | `999px` | the DEFAULT button shape |
| `--shadow-xs` | `0 1px 2px rgba(15,58,95,0.05)` | quiet lift |
| `--shadow-sm` | `0 2px 8px rgba(15,58,95,0.06)` | button / card |
| `--shadow-focus` | `0 0 0 3px rgba(0,120,193,0.28)` | focus ring |

### The four DS rules that bind every visual decision

1. **Sky IS the page, and cool leads.** `#ABDAEF` is the dominant open canvas (~70% cool); the default floating surface is `--surface-shell`; white nests inside for data. Cream is brand warmth in doses (~30%) — never the default operational fill. Never trap sky inside a card as a rectangular panel; never predominantly white; never beige or visibly yellow.
2. **Cross the sky/cream boundary at least once per screen, with a Craft Cut** — the organic router-cut curve, not a straight rule. Two cuts per screen maximum.
3. **Display ink follows the surface — never "display = navy".** On saturated sky a hero title is **cream** (accent line white); on cream and white it is navy. KPI numbers are navy. Navy carries eyebrows, subtitles, labels, data and controls. A navy headline on saturated sky is a task failure.
4. **Ration the display face.** Baloo 2 (`font-display`) for brand moments, page titles and KPI numbers only. Nunito Sans (`font-sans`) runs the UI. IBM Plex Mono (`font-mono`) for order IDs, SKUs, tracking numbers and money.

Contrast floor: no text lighter than `navy-500` on a light ground; no opacity-based de-emphasis on small text; focus rings intact; `prefers-reduced-motion` disables named keyframes.

### Verification commands (every task ends with these two passing)

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Pure-logic tests run with the repo's existing runner (no new test dependency):

```bash
node --test apps/dashboard/src/components/ds/status-tones.test.ts
```

**There is no component-test or visual-regression harness in this repo, and this plan does not add one.** Visual conformance is verified by (a) the token-adherence grep gate from Task 1 Step 6, (b) the DS `VERIFY.md` checklist against `docs/design-system/screenshots/reference/*.png`, and (c) the per-page interaction-parity checklist each Layer 4 task carries. Report honestly which of the three you ran.

**Commit discipline:** one commit per task, `refactor(ds):` for re-skins and `feat(ds):` for new DS components. Never squash layers together — each layer must be revertible on its own.

---

## Open decision — dark mode (resolve before Task 1, do not guess)

The app ships a full dark theme (`.dark` block in `globals.css`, `next-themes`, `ThemeToggle`, `animated-theme-toggler.tsx`, 90 `dark:` utilities across `src/`). **The GWP design system has no dark theme** — it is light-first by construction ("sky IS the page"), and inventing a dark GWP palette would violate the "never invent" non-negotiable.

Task 1 implements **Option A** unless the user chose otherwise:

- **Option A (planned): neutralise dark mode.** `.dark` redefines the same tokens to the same light GWP values, so the class becomes a no-op. The `ThemeToggle` leaves the shell in Task 17, but the component and the `next-themes` provider stay in place, unused. Nothing breaks, the 90 `dark:` utilities become dead but harmless, and a future GWP dark palette drops into one CSS block. Zero logic change.
- **Option B: keep a dark theme.** Requires inventing ~40 dark GWP token values. Out of scope; needs a DS decision first.

---

## Component mapping — the three groups

This table is the contract for Layers 1–2. Files under `src/components/ui/` are edited **in place**: same path, same exports, same prop names.

### Group A — 1:1 equivalent exists → replace directly (re-implement in place)

| Our component | Call sites | DS reference | Task |
|---|---|---|---|
| `ui/button.tsx` | 68 files | `components/core/Button.jsx` | 3 |
| `ui/button.tsx` size=`icon*` | — | `components/core/IconButton.jsx` | 3 |
| `ui/badge.tsx` | 47 files | `components/core/StatusBadge.jsx` (generic half) | 4 |
| `ui/input.tsx` | 40 files | `components/forms/Input.jsx` | 5 |
| `ui/textarea.tsx` | 18 files | `components/forms/Input.jsx` (multiline) | 5 |
| `ui/select.tsx`, `ui/native-select.tsx` | 39 files | `components/forms/Select.jsx` | 6 |
| `ui/checkbox.tsx` | 7 files | `components/forms/*` field contract | 6 |
| `ui/tooltip.tsx` | 4 files | `A11Y.md` tooltip contract | 7 |
| `ui/card.tsx` | 3 files | `components/data/Surface.jsx` | 8 |
| `ui/table.tsx` | 1 file | `components/data/DataTable.jsx` | 10 |
| `ui/pagination.tsx` | 0 files | `components/navigation/Pagination.jsx` | 11 |
| `ui/dialog.tsx` | 3 files | `components/feedback/Modal.jsx` | 12 |
| `ui/drawer.tsx`, `ui/sheet.tsx` | 4 files | `components/feedback/Drawer.jsx` | 12 |
| `ui/tabs.tsx` | 2 files | `components/navigation/TabBar.jsx` | 13 |
| `ui/toggle-group.tsx` | — | `components/forms/SegmentedControl.jsx` | 13 |
| `ui/skeleton.tsx` | 2 files | `components/feedback/Skeleton.jsx` | 13 |
| `ui/empty.tsx` | 0 files | `components/feedback/EmptyState.jsx` | 13 |
| `ui/sonner.tsx` | via `toast()` | `components/feedback/Toast.jsx` | 13 |
| `ui/command.tsx` | — | `components/feedback/CommandPalette.jsx` | 13 |
| `ui/calendar.tsx` | 0 files | `components/forms/DateRangeField.jsx` | 14 |
| `ui/chart.tsx` | 0 files | `components/data/ChartFrame.jsx` | 14 |
| `ui/breadcrumb.tsx` | — | `components/navigation/Breadcrumb.jsx` | 15 |

### Group B — DS has it but the API differs → adapter (rule 9)

| Our surface | DS reference | Adapter approach | Task |
|---|---|---|---|
| `global/data-table/data-table.tsx` — already carries sort, selection, server filtering, row actions, loading/empty/error and mobile cards | `components/data/DataTable.jsx` (`rows`/`columns` only) | **Keep our `DataTable` signature exactly; reskin its internals.** No page learns anything changed. | 10 |
| `global/data-table/data-table-toolbar.tsx` | `forms/FilterChip`, `forms/SearchField` | new `ds/filter-chip.tsx`, `ds/search-field.tsx`, consumed by the toolbar | 11 |
| `global/data-table/data-table-pagination.tsx` | `navigation/Pagination.jsx` | reskin in place, keep props | 11 |
| `global/form/form-dialog.tsx`, `responsive-dialog.tsx` | `feedback/Modal.jsx`, `feedback/Drawer.jsx` | reskin in place; `use-form-action.ts` untouched | 12 |
| KPI tiles: `pages/inventory/stat-tiles.tsx`, `pages/home/*` | `components/data/MetricCard.jsx` | new `ds/metric-card.tsx`; adopted in Layer 4 | 9, 19, 23 |
| Status rendering (`<Badge variant={statusVariant(o.status)}>`) | `core/StatusBadge` + `STATUS_TONES` | new `ds/status-badge.tsx` + `ds/status-tones.ts` | 2, 4 |
| `global/layout/navbar/*`, `global/layout/sidebar/app-sidebar.tsx` | `navigation/TopNav.jsx`, `Sidebar.jsx`, `AdminBar.jsx` | reskin in place; root layout drops the persistent rail | 16, 17, 18 |
| `global/search/*` | `forms/SearchField.jsx`, `feedback/CommandPalette.jsx` | reskin; `useHybridSearch` untouched | 11 |
| `pages/support/ticket-thread.tsx` | `feedback/TicketConversation.jsx` | reskin in place | 21 |
| `pages/profile/*` money panels | `data/WalletSummary.jsx`, `data/KeyValueRow.jsx` | new `ds/key-value-row.tsx`; adopt in Layer 4 | 8, 26 |

### Group C — no DS equivalent → keep the component, restyle to tokens only

`accordion` · `alert` · `alert-dialog` · `aspect-ratio` · `attachment` · `avatar` · `bubble` · `button-group` · `collapsible` · `combobox` · `context-menu` · `direction` · `dropdown-menu` (15 files) · `field` · `hover-card` · `input-group` · `input-otp` · `item` · `kbd` · `label` · `marker` · `menubar` · `message` · `message-scroller` · `navigation-menu` · `progress` · `radio-group` · `resizable` · `scroll-area` · `separator` · `slider` · `spinner` · `switch` · `toggle` · `custom/spotlight-card` · `animated-theme-toggler`.

These get **no structural change**. Because they are already written against the semantic tokens Task 1 remaps, most inherit GWP looks for free; Task 7 sweeps the handful that hard-code Vercel-specific utilities.

---

## File structure

**New — the ported DS layer (`src/components/ds/`).** One responsibility per file, mirroring the DS's own categorisation so any component traces back to its reference:

```
src/components/ds/
  index.ts                 barrel — the only import path pages use
  status-tones.ts          STATUS_TONES map + toneFor()  (pure, tested)
  status-tones.test.ts     node --test
  status-badge.tsx         StatusBadge — wraps ui/badge with tone tokens
  metric-card.tsx          MetricCard — KPI tile (Baloo 2 numerals)
  surface.tsx              Surface — the shell / data / inset surface ladder
  section-heading.tsx      SectionHeading
  key-value-row.tsx        KeyValueRow
  product-cell.tsx         ProductCell — thumbnail + name + SKU
  callout.tsx              Callout
  loading-state.tsx        LoadingState
  filter-chip.tsx          FilterChip
  search-field.tsx         SearchField
  chart-frame.tsx          ChartFrame
  page.tsx                 Page · PageHeader · PageToolbar · PageSection
  craft-cut.tsx            CraftCut — the organic sky/cream boundary
  brand/gwp-mark.tsx       GwpMark
  brand/wood-rings.tsx     WoodRings
```

**Vendored DS reference (`docs/design-system/`)** — read-only source of truth, checked in so the migration never depends on the design MCP being authorised.

**Modified in place** — `src/app/globals.css` (token layer), `src/app/layout.tsx` (shell), `src/components/ui/*` (primitives), `src/components/global/**` (composites + shell), and in Layer 4 only, the JSX wrappers in `src/components/pages/**` and `src/app/(protected)/**/page.tsx`.

**Never modified** — `src/modules/**`, `src/hooks/use-permissions.ts`, `src/components/global/permission-gate/**`, `libs/**`, every `zod` schema, every route path.

---

## Task index

| Layer | Tasks | Deliverable |
|---|---|---|
| 0 — Foundation | 1–2 | GWP tokens live behind the semantic layer; whole app re-skinned without a component edit |
| 1 — Primitives | 3–7 | Button, Badge/StatusBadge, Input, Select, Checkbox, Tooltip carry GWP geometry |
| 2 — Composite | 8–14 | Card/Surface, MetricCard, Table/DataTable, Toolbar/Pagination, Modal/Drawer, Tabs/feedback, DateRange/Charts |
| 3 — Shell | 15–18 | `Page` primitives, sky page field, cream floating TopNav, admin/warehouse chrome |
| 4 — Pages | 19–26 | 32 routes recomposed; interaction parity proven per page |
| Close-out | 27 | Adherence sweep, dead-token removal, VERIFY.md pass |

Layer boundaries are review gates. Do not start a layer until the previous one builds, lints and has been visually accepted.
---

# LAYER 0 — Foundation

The whole app re-skins here, before a single component is edited. Two tasks.

---

### Task 1: Vendor the GWP token layer and remap the semantic tokens

**Files:**
- Create: `docs/design-system/` (vendored DS reference — read-only)
- Create: `apps/dashboard/src/app/gwp.theme.css`
- Modify: `apps/dashboard/src/app/globals.css:1-10` (imports), `:7-155` (`@theme inline`), `:156-261` (`:root`), `:262-339` (`.dark`)
- Modify: `apps/dashboard/src/app/layout.tsx:1-30` (fonts)
- Create: `apps/dashboard/scripts/check-ds-adherence.sh`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: Tailwind utilities for every GWP token — `bg-sky-300`, `bg-cream-100`, `text-navy-700`, `text-navy-500`, `bg-neutral-50`, `text-action-500`, `bg-status-success-bg`, `text-status-success-fg`, `rounded-(--radius-card)`, `rounded-(--radius-control)`, `shadow-(--shadow-sm)`, `font-display`, `font-sans`, `font-mono`, `h-(--control-height)`. Plus the remapped semantic aliases every existing component already uses: `bg-background`, `text-foreground`, `bg-card`, `bg-popover`, `bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-muted`, `text-muted-foreground`, `bg-accent`, `border-border`, `ring-ring`, `bg-destructive`.

- [ ] **Step 1: Vendor the design-system reference into the repo**

The DS export lives at `~/Downloads/GoodWoodPrint Fulfillment Design System1.zip` (561 files). Copy in only what the migration reads, so the repo does not gain 238 MB of PNGs:

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
mkdir -p docs/design-system
Z="$HOME/Downloads/GoodWoodPrint Fulfillment Design System1.zip"
unzip -q -o "$Z" \
  'SKILL.md' 'readme.md' 'CLAUDE_CODE_HANDOFF.md' 'VERIFY.md' 'STATES.md' \
  'RESPONSIVE.md' 'I18N.md' 'ICONS.md' 'A11Y.md' 'DOMAIN_RESOLVED.md' \
  'BE_ALIGNMENT.md' 'BACKEND_ASKS.md' 'BACKEND_GAPS.md' 'SYNC.md' \
  'tokens.json' 'tokens/*' 'handoff/*' 'types/*' \
  'components/*/*.d.ts' 'components/*/*.prompt.md' 'components/fixtures.json' \
  'ui_kits/screen-manifest.json' 'guidelines/*' \
  -d docs/design-system
ls docs/design-system
```

Then add the screen reference PNGs, which are how a reviewer *sees* the target:

```bash
unzip -q -o "$Z" 'screenshots/reference/*' -d docs/design-system
du -sh docs/design-system
```

If `docs/design-system` exceeds ~40 MB, drop `screenshots/reference/` from git and note in `docs/design-system/README.md` that it is fetched from the zip on demand — `.vercelignore` already keeps uploads under the 100 MB limit but `docs/` is not currently listed there. Verify:

```bash
grep -n "docs" .vercelignore || echo "docs/ NOT ignored — add it"
```

Add `docs/design-system/` to `.vercelignore` if the grep prints the warning.

- [ ] **Step 2: Create the app's theme sheet from the DS's compiled theme**

`docs/design-system/handoff/gwp.theme.css` is `tokens.json` compiled to a Tailwind v4 `@theme inline` sheet — 238 tokens, 163 utility mappings. Copy it into the app and strip its Google Fonts `@import`, because we load the three faces through `next/font` instead (self-hosted, no render-blocking request, no FOUT):

```bash
cd apps/dashboard
sed '/fonts.googleapis.com/d' ../../docs/design-system/handoff/gwp.theme.css > src/app/gwp.theme.css
head -3 src/app/gwp.theme.css
grep -c "fonts.googleapis" src/app/gwp.theme.css   # must print 0
```

Add this header comment at the top of `src/app/gwp.theme.css`, above the generated content, so nobody hand-edits a generated file:

```css
/* GENERATED — do not hand-edit.
   Source: docs/design-system/handoff/gwp.theme.css (compiled from the DS
   tokens.json). Regenerate with:
     sed '/fonts.googleapis.com/d' \
       ../../docs/design-system/handoff/gwp.theme.css > src/app/gwp.theme.css
   The Google Fonts @import is stripped deliberately: the three faces are
   loaded via next/font in src/app/layout.tsx. Never add a colour here that is
   not in tokens.json. */
```

- [ ] **Step 3: Swap the three font faces**

In `apps/dashboard/src/app/layout.tsx`, replace the Geist font block (lines 1–30) with Baloo 2 / Nunito Sans / IBM Plex Mono. Keep `metadata` and the rest of the file exactly as it is — the shell itself changes in Task 16, not here.

```tsx
import type { Metadata } from "next";
import { Baloo_2, Nunito_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// GWP type rationing (DS SKILL.md rule 4): Baloo 2 is brand moments, page
// titles and KPI numerals ONLY; Nunito Sans runs the UI; IBM Plex Mono carries
// order IDs, SKUs, tracking numbers and money. Loading all three through
// next/font keeps them self-hosted — the DS's own sheet uses a Google Fonts
// @import, which we strip in gwp.theme.css.
const displayFont = Baloo_2({
  variable: "--font-display-face",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const bodyFont = Nunito_Sans({
  variable: "--font-body-face",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
```

Update the `<html>` className on the same file to use the new variables (this is the only other line that changes in layout.tsx this task):

```tsx
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} h-full antialiased`}
```

Delete the now-unused `apps/dashboard/src/app/fonts/Geist-Variable.woff2` **only after** the build in Step 7 passes — the `localFont` import is the sole reference, so a build error means something else still points at it:

```bash
grep -rn "Geist-Variable\|font-geist-mono\|localFont" apps/dashboard/src || echo "no references left"
```

- [ ] **Step 4: Import the theme and remove the colliding entries from the app's own `@theme` block**

At the top of `apps/dashboard/src/app/globals.css`, the import list becomes:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./gwp.theme.css";

@custom-variant dark (&:is(.dark *));
```

Then, inside the existing `@theme inline { … }` block, **delete** the entries GWP now owns, so two `@theme` blocks never define the same key:

- the whole `--radius-xs` … `--radius-pill` group (GWP: 8/10/14/18/24/32/44/999 px — deliberately rounder than Geist's 4/6/8/12)
- the `--shadow-ds-1` … `--shadow-ds-5` group (GWP shadows are blue-tinted and wide; replaced in Step 5)
- `--ease-geist`

**Do NOT delete the `--text-display-*` / `--text-body-*` type scale.** A
pre-flight check found 29 live call sites (`text-display-xl` ×4, `-lg` ×7,
`-md` ×7, `-sm` ×5, `text-body-lg` ×2, `-md` ×2, `-sm` ×2). In Tailwind v4 an
undefined utility is silently dropped rather than failing the build, so
deleting these keys would cost 29 silent type regressions. **Repoint them to
GWP's ladder instead** — the call sites keep working and land on GWP metrics:

```css
  --text-display-xl: var(--fs-display-xl);
  --text-display-lg: var(--fs-display-lg);
  --text-display-md: var(--fs-display-md);
  --text-display-sm: var(--fs-display-sm);
  --text-body-lg: var(--fs-body-lg);
  --text-body-md: var(--fs-body);
  --text-body-sm: var(--fs-body-sm);
```

Drop each one's `--line-height`, `--letter-spacing` and `--font-weight`
sub-properties: the negative tracking is a Geist signature, and GWP sets
tracking through `--ls-display` / `--ls-body` instead. Layer 4 tasks may
migrate individual call sites to `text-(length:--fs-*)` opportunistically, but
no task in this plan is required to.
- the `--color-vercel-*` group and `--color-gray-alpha-*` group (no Vercel brand colour survives the migration)
- `--ease-geist`

**Keep** every `--color-<semantic>: var(--<semantic>)` mapping (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, sidebar-*, chart-*) — those are the aliases 200+ files already use, and Step 5 repoints what they resolve to. Keep the surface/text ladder mappings (`--color-canvas`, `--color-hairline`, `--color-body-text`, `--color-mute`) and the semantic pairs (`--color-link*`, `--color-warning*`, `--color-error*`) for the same reason.

Finally, repoint the three font keys in that block:

```css
  --font-sans: var(--font-body-face), "Nunito Sans", system-ui, sans-serif;
  --font-display: var(--font-display-face), "Baloo 2", "Nunito Sans", system-ui, sans-serif;
  --font-mono: var(--font-mono-face), "IBM Plex Mono", ui-monospace, Consolas, monospace;
  --font-heading: var(--font-display);
```

- [ ] **Step 5: Replace the `:root` values — this is the step that re-skins the app**

Replace the entire `:root { … }` block (globals.css:156-261) with the following. Every right-hand side is a GWP token defined in `gwp.theme.css`; nothing is a new colour.

```css
:root {
  /* ── The semantic layer, repointed at GWP ──────────────────────────
     Nothing below is a new colour: each value is a token from
     gwp.theme.css. Repointing here is what re-skins all 223 component
     files without editing one of them.

     Surface ladder (DS surfaces.css): SKY is the page, --surface-shell
     (#FBFCFA) is the default floating operational surface, WHITE nests
     inside it for data. Cream is a BRAND surface — nav, marketing,
     product wells — never the default operational fill, so `--card` is
     shell, not cream. */
  --background: var(--surface-canvas);        /* #ABDAEF — sky IS the page */
  --foreground: var(--text-strong);           /* navy-900 */
  --card: var(--surface-shell);               /* #FBFCFA, the default surface */
  --card-foreground: var(--text-body);        /* navy-700 */
  --popover: var(--surface-raised);           /* white — menus, drawers */
  --popover-foreground: var(--text-body);

  /* Action Blue is the ONE fill that clears 4.5:1 with white text. It is
     reserved for the single most important action in a region — the
     `variant="default"` button, and nothing else. */
  --primary: var(--action-500);
  --primary-foreground: var(--text-on-action);
  --secondary: var(--sky-200);
  --secondary-foreground: var(--navy-700);

  --muted: var(--neutral-100);
  /* Contrast floor (readme.md §7): navy-500 is the LIGHTEST permitted text
     on a light ground. `text-muted-foreground` is the app's most-used
     secondary text utility, so it sits exactly on the floor — never below. */
  --muted-foreground: var(--text-muted);      /* navy-500 */
  --accent: var(--sky-100);                   /* the hover step */
  --accent-foreground: var(--navy-700);
  --destructive: var(--red-600);

  --border: var(--border-hairline);           /* rgba(15,58,95,0.08) */
  --input: var(--border-soft);                /* rgba(15,58,95,0.12) */
  --ring: var(--border-focus);                /* action-500 */

  /* Charts: the DS gives no chart palette, so these are the brand accents in
     the order the DS permits them — action, sky, orange, green, yellow. Not a
     new palette; five existing tokens. */
  --chart-1: var(--action-500);
  --chart-2: var(--sky-500);
  --chart-3: var(--orange-500);
  --chart-4: var(--green-600);
  --chart-5: var(--yellow-600);

  --radius: var(--radius-card);               /* 14px */

  /* The sidebar is no longer a separate surface: Task 17 turns it into a
     sheet over the cream nav shell. Cream here, matching --surface-nav. */
  --sidebar: var(--surface-nav);
  --sidebar-foreground: var(--text-body);
  --sidebar-primary: var(--action-500);
  --sidebar-primary-foreground: var(--text-on-action);
  --sidebar-accent: var(--cream-200);
  --sidebar-accent-foreground: var(--navy-700);
  --sidebar-border: var(--border-hairline);
  --sidebar-ring: var(--border-focus);

  /* Semantic pairs — base fill / soft bg / readable deep text. Mapped onto
     the GWP status tones so a component using `bg-error-soft text-error-deep`
     lands on the same colours as a StatusBadge with tone="critical". */
  --link: var(--text-link);
  --link-deep: var(--text-link-hover);
  --link-soft: var(--action-100);
  --error: var(--red-600);
  --error-soft: var(--status-critical-bg);
  --error-deep: var(--status-critical-fg);
  --warning: var(--orange-500);
  --warning-soft: var(--status-attention-bg);
  --warning-deep: var(--status-attention-fg);
  --violet-soft: var(--sky-100);
  --violet-deep: var(--navy-600);
  --cyan-soft: var(--sky-100);
  --cyan-deep: var(--sky-600);

  /* Surface + text ladder aliases (used directly by ~a dozen components) */
  --canvas: var(--surface-data);
  --canvas-soft: var(--surface-shell);
  --canvas-soft-2: var(--surface-content-alt);
  --hairline: var(--border-hairline);
  --hairline-strong: var(--border-strong);
  --body-text: var(--text-body);
  --mute: var(--text-muted);                  /* navy-500, the floor */

  /* Elevation. GWP shadows are blue-tinted, wide and faint — they read as
     light, never as elevation drama. The Geist inset-ring trick is dropped:
     GWP separates surfaces by a change of surface plus a hairline. */
  --ds-ring: var(--border-hairline);
  --shadow-card: var(--shadow-sm);

  --selection-bg: var(--sky-200);
  --selection-fg: var(--navy-900);
}
```

Also add, immediately after that block, the five shadow aliases the app's components reference by name (`shadow-ds-4` appears in the mobile dock, among others). They now resolve to GWP's ladder:

```css
@theme inline {
  --shadow-ds-1: var(--shadow-xs);
  --shadow-ds-2: var(--shadow-sm);
  --shadow-ds-3: var(--shadow-sm);
  --shadow-ds-4: var(--shadow-md);
  --shadow-ds-5: var(--shadow-lg);
}
```

- [ ] **Step 6: Neutralise the dark theme (Option A from the open decision)**

Replace the whole `.dark { … }` block (globals.css:262-339) with a single-token no-op plus an explanatory comment. Do NOT delete the block or the `@custom-variant dark` line — 90 `dark:` utilities and the `next-themes` provider still compile against them.

```css
/* ── DARK MODE IS NEUTRALISED ───────────────────────────────────────
   The GWP design system is light-first by construction — "sky IS the
   page" — and ships no dark palette. Inventing one would break the
   system's "never invent" rule, so `.dark` deliberately resolves to the
   same light tokens: the class becomes a no-op rather than a broken
   half-theme.

   Nothing is deleted. next-themes, ThemeToggle and the 90 `dark:`
   utilities across src/ still compile; they simply have no effect. When
   the DS publishes a dark palette, it drops into this one block.
   Task 17 removes the toggle from the shell. */
.dark {
  color-scheme: light;
}
```

- [ ] **Step 7: Add the token-adherence gate**

This script is the standing check that no task re-introduces a hard-coded colour or a forbidden source. Create `apps/dashboard/scripts/check-ds-adherence.sh`:

```bash
#!/usr/bin/env bash
# GWP design-system adherence gate. Run after every migration task.
# Fails on: hex/rgb colour literals in components, surviving Vercel brand
# tokens, and Tailwind's own palette leaking in next to GWP's ramps.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
fail=0

report() { printf '\n== %s ==\n' "$1"; }

report "hex / rgb / oklch literals in components (must be empty)"
if grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\(' \
     --include='*.tsx' --include='*.ts' src/components src/app \
     | grep -v '\.test\.' | grep -v 'gwp.theme.css'; then
  echo "FAIL: colour literal outside the token layer"; fail=1
else echo "ok"; fi

report "surviving Vercel brand tokens (must be empty)"
if grep -rn 'vercel-\|gray-alpha-\|ease-geist' \
     --include='*.tsx' --include='*.ts' --include='*.css' src; then
  echo "FAIL: Vercel-era token still referenced"; fail=1
else echo "ok"; fi

report "Tailwind default palette next to GWP ramps (must be empty)"
# NOTE: sky / navy / action / cream / wash / yellow / green / red / orange /
# neutral are all GWP ramp names and must NOT appear in this list — GWP owns
# them. Only names GWP defines no ramp for are forbidden here.
if grep -rnE '\b(bg|text|border|ring|fill|stroke|divide)-(slate|gray|zinc|stone|amber|lime|emerald|teal|cyan|indigo|violet|purple|fuchsia|rose|blue)-[0-9]{2,3}\b' \
     --include='*.tsx' src; then
  echo "FAIL: non-GWP palette utility"; fail=1
else echo "ok"; fi

report "neutral steps GWP does not define (only 50 and 100 exist)"
if grep -rnE '\b(bg|text|border|ring|fill|stroke|divide)-neutral-(?!50\b|100\b)[0-9]{2,3}\b' \
     --include='*.tsx' -P src; then
  echo "FAIL: neutral step outside GWP's 50/100"; fail=1
else echo "ok"; fi

report "backend metadata palette read for chrome (must be empty)"
if grep -rn 'metadata\.\(theme\|color\)\|FULFILLED_STATUS' \
     --include='*.tsx' --include='*.ts' src/components; then
  echo "FAIL: reading the forbidden metadata.ts palette"; fail=1
else echo "ok"; fi

echo
[ "$fail" -eq 0 ] && echo "ADHERENCE: PASS" || echo "ADHERENCE: FAIL"
exit "$fail"
```

Make it executable and run it. It will **fail on this first run** — that is expected and is the task's own worklist:

```bash
chmod +x apps/dashboard/scripts/check-ds-adherence.sh
apps/dashboard/scripts/check-ds-adherence.sh
```

Expected first-run failures and their fixes, all mechanical:

- `text-neutral-600` (3 occurrences) and `border-neutral-300` (2) → `text-navy-500` / `border-(--border-soft)`. Find them with:
  ```bash
  grep -rn "text-neutral-600\|border-neutral-300" --include='*.tsx' apps/dashboard/src
  ```
- Any `--color-vercel-*` consumer → the nearest GWP accent (`text-action-500` for blue, `text-orange-500` for orange/amber, `text-green-600` for green, `text-red-600` for red). Find them with:
  ```bash
  grep -rn "vercel-" --include='*.tsx' apps/dashboard/src
  ```
- `gray-alpha-*` consumers → `bg-(--border-hairline)` for fills, `border-(--border-soft)` for borders.

Fix every hit, then re-run until it prints `ADHERENCE: PASS`. Wire it into CI by adding one line to `.github/workflows/ci.yml`, immediately before the `turbo run lint` step:

```yaml
      - run: apps/dashboard/scripts/check-ds-adherence.sh
```

- [ ] **Step 8: Verify lint and build**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

Expected: PASS.

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: PASS. If it fails on a missing `--font-sans`, Step 4's font remap was skipped.

- [ ] **Step 9: Look at the result before committing**

```bash
npm run dev -w @opcreative/dashboard
```

Open `http://localhost:3000` signed in and confirm, by eye:

- the page ground is **bright sky**, not white;
- cards and panels are the soft neutral `#FBFCFA`, not cream and not white;
- body copy is navy, secondary copy is navy-500 and still legible;
- the primary button is Action Blue;
- radii are visibly rounder than before;
- toggling the theme does nothing (dark is a no-op).

Buttons are still rectangular and the shell is still a Vercel sidebar — those are Tasks 3 and 16. Anything *illegible* is a Task 1 bug; fix it here rather than patching it in a later layer.

- [ ] **Step 10: Commit**

```bash
git add docs/design-system docs/superpowers apps/dashboard/src/app/gwp.theme.css apps/dashboard/src/app/globals.css apps/dashboard/src/app/layout.tsx apps/dashboard/scripts/check-ds-adherence.sh .github/workflows/ci.yml .vercelignore
git commit -m "refactor(ds): install GWP token layer behind the semantic tokens

Repoints --background/--card/--primary/--border and the rest of the shadcn
semantic layer at GWP tokens, so all 223 component files re-skin without an
edit. Swaps Geist for Baloo 2 / Nunito Sans / IBM Plex Mono via next/font.
Neutralises dark mode (the DS ships no dark palette). Adds the adherence gate.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The status-tone map (the one piece of real, testable logic)

Status colour is the migration's highest-risk correctness detail: the DS forbids reading the backend's `metadata.ts` theme/color literals, and the app currently picks badge variants with a local `statusVariant()` helper in `orders-table.tsx`. This task builds the single canonical map, with tests, before anything consumes it.

**Files:**
- Create: `apps/dashboard/src/components/ds/status-tones.ts`
- Create: `apps/dashboard/src/components/ds/status-tones.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type StatusTone = "success" | "progress" | "info" | "pending" | "attention" | "critical" | "neutral"`; `export const STATUS_TONES: Readonly<Record<string, StatusTone>>`; `export function toneFor(status: string | null | undefined): StatusTone`. Task 4's `StatusBadge` is the only consumer.

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/src/components/ds/status-tones.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { STATUS_TONES, toneFor } from "./status-tones.ts";

test("maps the canonical DS statuses to their documented tones", () => {
  // Verbatim from docs/design-system/tokens/status-tones.json — the DS calls
  // these seven tones canonical for all UI (ALIGNMENT_AUDIT §T4).
  assert.equal(toneFor("Fulfilled"), "success");
  assert.equal(toneFor("Delivered"), "success");
  assert.equal(toneFor("In Production"), "progress");
  assert.equal(toneFor("Shipped"), "info");
  assert.equal(toneFor("Pending"), "pending");
  assert.equal(toneFor("Production Ready"), "pending");
  assert.equal(toneFor("Design problems"), "attention");
  assert.equal(toneFor("Low Stock"), "attention");
  assert.equal(toneFor("Cancel"), "critical");
  assert.equal(toneFor("Out Of Stock"), "critical");
  assert.equal(toneFor("Processing"), "neutral");
  assert.equal(toneFor("Validating"), "neutral");
});

test("maps the ticket lifecycle statuses", () => {
  assert.equal(toneFor("open"), "attention");
  assert.equal(toneFor("in_progress"), "progress");
  assert.equal(toneFor("closed"), "success");
});

test("matches statuses irrespective of case and separator", () => {
  // The DB enum is SCREAMING_SNAKE (FulfillmentStatus), the DS map is
  // Title Case prose. Both must land on the same tone or the badge colour
  // depends on which layer handed us the string.
  assert.equal(toneFor("IN_PRODUCTION"), "progress");
  assert.equal(toneFor("in production"), "progress");
  assert.equal(toneFor("OUT_OF_STOCK"), "critical");
  assert.equal(toneFor("ON_HOLD"), "attention");
});

test("falls back to neutral for an unknown or empty status", () => {
  // Never throw and never invent a colour: an unrecognised status is grey.
  assert.equal(toneFor("Some Status The Backend Added Today"), "neutral");
  assert.equal(toneFor(""), "neutral");
  assert.equal(toneFor(null), "neutral");
  assert.equal(toneFor(undefined), "neutral");
});

test("exposes the raw DS map for the adherence check", () => {
  assert.equal(STATUS_TONES["Fulfilled"], "success");
  assert.equal(Object.keys(STATUS_TONES).length >= 26, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test apps/dashboard/src/components/ds/status-tones.test.ts
```

Expected: FAIL — `Cannot find module './status-tones.ts'`.

- [ ] **Step 3: Write the implementation**

Create `apps/dashboard/src/components/ds/status-tones.ts`:

```ts
/**
 * The canonical status → tone map.
 *
 * SOURCE OF TRUTH: docs/design-system/tokens/status-tones.json, copied
 * verbatim. The DS resolved (ALIGNMENT_AUDIT §T4) that these seven semantic
 * tones are canonical for all UI, and that the backend's `metadata.ts`
 * `theme`/`color` hex literals — served by `GET /api/metadata` — are the
 * pre-rebrand pastel palette and must be treated as dead data. Never read
 * them for chrome; never hand-pick a badge colour at a call site.
 *
 * Tones resolve to colour through the `--status-<tone>-{bg,fg,dot}` tokens in
 * gwp.theme.css. Adding a key here is a design-system change: mirror it back
 * into the DS's status-tones.json rather than diverging.
 *
 * DOMAIN-BOUND (per StatusBadge.d.ts): the transitions between statuses, the
 * production lifecycle, the shipping lifecycle, and the value set of the
 * separate `tracking_status` field are NOT modelled here. `tracking_status`
 * exists on the order but has no enum, so it is not assumed to match
 * ORDER_STATUS — an unrecognised value renders neutral, which is correct.
 */
export type StatusTone =
  | "success"
  | "progress"
  | "info"
  | "pending"
  | "attention"
  | "critical"
  | "neutral";

export const STATUS_TONES: Readonly<Record<string, StatusTone>> = Object.freeze({
  Fulfilled: "success",
  Completed: "success",
  Produced: "info",
  Shipped: "info",
  Delivered: "success",
  Active: "success",
  "In Stock": "success",
  Refund: "info",
  "In Production": "progress",
  Filled: "progress",
  Processing: "neutral",
  Validating: "neutral",
  "Mockup Generating": "neutral",
  Pending: "pending",
  "Production Ready": "pending",
  Return: "attention",
  "Low Stock": "attention",
  "Wrong Label": "attention",
  "Design problems": "attention",
  Cancel: "critical",
  Delayed: "critical",
  "Out Of Stock": "critical",
  "Asset processing failed": "critical",
  open: "attention",
  in_progress: "progress",
  closed: "success",
  // Prisma FulfillmentStatus values with no prose twin in the DS map. Not new
  // vocabulary — they are the existing DB enum, tone-assigned by the same
  // rules the DS applies to its own list.
  ON_HOLD: "attention",
});

/** Normalise so SCREAMING_SNAKE, Title Case and spaced prose collapse to one key. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

const NORMALISED: ReadonlyMap<string, StatusTone> = new Map(
  Object.entries(STATUS_TONES).map(([key, tone]) => [normalise(key), tone]),
);

/**
 * The status string as it exists in the system → its semantic tone.
 * Unknown, empty and nullish statuses are `neutral`: never throw, and never
 * invent a colour for vocabulary the design system has not seen.
 */
export function toneFor(status: string | null | undefined): StatusTone {
  if (!status) return "neutral";
  return NORMALISED.get(normalise(status)) ?? "neutral";
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test apps/dashboard/src/components/ds/status-tones.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Wire the test into CI**

In `.github/workflows/ci.yml`, directly after the existing permissions-test line, add:

```yaml
      - run: node --test apps/dashboard/src/components/ds/status-tones.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/ds/status-tones.ts apps/dashboard/src/components/ds/status-tones.test.ts .github/workflows/ci.yml
git commit -m "feat(ds): canonical status-tone map, ported verbatim from the DS

Seven semantic tones, normalised so the Prisma SCREAMING_SNAKE enum and the
DS's Title Case prose collapse to one key. Unknown statuses render neutral
rather than inventing a colour. The backend metadata.ts palette stays unread.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**LAYER 0 REVIEW GATE.** Before starting Layer 1: the app must build, the adherence gate must pass, and a human must confirm the sky ground and navy ink by eye. Layer 0 is revertible with a single `git revert` — that property is worth preserving.
---

# LAYER 1 — Primitives

Five tasks. Every file here is edited **in place**: same path, same exports, same prop names, same sizes. Only fill, ink, radius, shadow and press behaviour change. **No page is touched in this layer** — that is the whole point: Button alone reaches 68 files for free.

Control heights are unchanged because GWP's ladder already matches the app's: `--control-height-sm` 32px = `h-8`, `--control-height` 40px = `h-10`, `--control-height-lg` 48px = `h-12`.

---

### Task 3: Button and IconButton

**Files:**
- Modify: `apps/dashboard/src/components/ui/button.tsx` (whole file)
- Reference: `docs/design-system/components/core/Button.d.ts`, `docs/design-system/components/core/Button.prompt.md`, `docs/design-system/components/core/IconButton.prompt.md`

**Interfaces:**
- Consumes: the token layer from Task 1.
- Produces: `Button` and `buttonVariants` at the same path with the same signature — `variant` ∈ `default | outline | secondary | ghost | destructive | link`, **plus three new values** `cream | inverse | accent` for Layer 3's shell and marketing surfaces, and a new optional `shape` ∈ `pill | rounded` defaulting to `pill`. `size` values are unchanged: `default | xs | sm | lg | icon | icon-xs | icon-sm | icon-lg`. Tasks 11, 12, 16, 17 and every Layer 4 task consume it.

**Two deliberate visual changes to expect and not "fix" later:**

1. **Buttons become pills.** GWP buttons are soft pills by default, borderless, carried by their fill and one quiet shadow. `shape="rounded"` (10px) stays available for dense operational toolbars only.
2. **`variant="destructive"` stops being a filled red button.** The DS's `danger` variant is a white pill with `red-600` ink and a `red-200` hairline — there is no filled-red button anywhere in the system, and inventing one would breach the "no new colours / never invent" rule. Destructive actions stay unmistakable through ink and the confirm dialog they already open, not through a red slab.

- [ ] **Step 1: Replace the file**

```tsx
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The GWP button — a soft PILL by default, borderless, carried by its fill and
 * one quiet shadow. Ported from the design system's `components/core/Button`.
 *
 * Action Blue (`variant="default"`) is reserved for the single most important
 * action in a region: one per toolbar, one per dialog footer. Everything else
 * is `outline` (white pill, blue ink — the DS's `secondary`), `secondary`
 * (pale sky fill, navy ink — the DS's `soft`) or `ghost`.
 *
 * The prop is `variant` — shadcn's real name, restored in Task 0b after the
 * upstream mangle had renamed it to `product`.
 *
 * `variant="inverse"` is for NAVY-class grounds only — cream ink on navy-700
 * clears 4.5:1. It is NOT valid on `--surface-hero-deep` (sky-600), where cream
 * is 3.65:1 and therefore large-text only; use `cream` or `outline` there.
 * `ghost` is LIGHT GROUNDS ONLY: its hover swaps in a pale sky fill, so a
 * light-labelled ghost on a dark ground goes invisible.
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center",
    "border border-transparent bg-clip-padding whitespace-nowrap select-none",
    "font-sans font-bold tracking-(--ls-label) leading-none",
    // GWP motion: 140ms ease-out on colour/shadow, and a press scale instead
    // of the Geist 1px nudge.
    "transition-[background-color,color,border-color,box-shadow,transform] duration-(--dur-fast) ease-(--ease-out)",
    "active:not-aria-[haspopup]:scale-(--press-scale)",
    "motion-reduce:transition-none motion-reduce:active:scale-100",
    // Focus is the DS's blue glow, not a ring-offset halo.
    "outline-none focus-visible:shadow-(--shadow-focus)",
    // Disabled keeps the variant's own colours and drops to 45% — the DS does
    // not repaint a disabled control grey.
    "disabled:pointer-events-none disabled:opacity-45",
    "aria-invalid:border-(--status-critical-fg) aria-invalid:shadow-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        // Action Blue fill, white label — one per region.
        default:
          "bg-primary text-primary-foreground shadow-(--shadow-sm) hover:bg-action-600",
        // The DS's `secondary`: white pill, Action Blue label. This is the
        // app's workhorse second action, so it takes the DS's second variant.
        outline:
          "bg-(--surface-data) text-action-600 shadow-(--shadow-sm) hover:bg-sky-50 aria-expanded:bg-sky-50",
        // The DS's `soft`: pale sky fill, navy label — quiet brand action.
        secondary:
          "bg-sky-200 text-navy-700 shadow-(--shadow-xs) hover:bg-sky-300 aria-expanded:bg-sky-300",
        // LIGHT GROUNDS ONLY (see the file comment).
        ghost:
          "bg-transparent text-navy-600 hover:bg-sky-100 aria-expanded:bg-sky-100",
        // The DS's `danger`. Deliberately NOT a filled red button: the system
        // has none, and one would be a new colour.
        destructive:
          "bg-(--surface-data) text-(--status-critical-fg) border-(--status-critical-bg) shadow-(--shadow-xs) hover:bg-(--status-critical-bg)",
        link: "text-(--text-link) underline-offset-4 hover:text-(--text-link-hover) hover:underline",
        // Marketing / brand surfaces.
        cream:
          "bg-cream-100 text-navy-700 shadow-(--shadow-sm) hover:bg-cream-200",
        // NAVY-class grounds only.
        inverse:
          "bg-transparent text-cream-100 border-cream-100/34 hover:bg-cream-100/18 hover:border-cream-100/50",
        // Yellow. Marketing only, very rare.
        accent:
          "bg-yellow-500 text-navy-900 shadow-(--shadow-xs) hover:bg-yellow-500/85",
      },
      /**
       * `pill` is the default everywhere. `rounded` (10px, --radius-control)
       * is for dense operational toolbars only — a row of pills in a filter
       * bar reads as scattered lozenges.
       */
      shape: {
        pill: "rounded-(--radius-pill)",
        rounded: "rounded-(--radius-control)",
      },
      size: {
        // GWP control ladder: 32 / 40 / 48px — the same heights as before.
        // Padding widens because a pill needs more horizontal room than a
        // rectangle to read as one shape (DS Button PAD: 16 / 22 / 28px).
        default:
          "h-10 gap-2 px-[22px] text-(length:--fs-body) has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-6 gap-1 px-3 text-(length:--fs-micro) [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-4 text-(length:--fs-body-sm) [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-7 text-(length:--fs-body-lg) has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        // IconButton — square, and the DS keeps icon buttons circular.
        icon: "size-10 p-0",
        "icon-xs": "size-6 p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 p-0 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-11 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      shape: "pill",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  shape = "pill",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, shape, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

- [ ] **Step 2: Check that no call site was relying on a removed utility**

The old file carried `disabled:bg-muted disabled:text-mute` and `active:translate-y-px`. Confirm nothing overrides or depends on them:

```bash
cd apps/dashboard
grep -rn "translate-y-px\|disabled:bg-muted\|disabled:text-mute" --include='*.tsx' src | grep -v "components/ui/"
```

Expected: no output. Any hit is a call site fighting the primitive — fix it by deleting the redundant class at the call site, not by re-adding the utility here.

- [ ] **Step 3: Check that `icon-sm` growing 28px → 32px breaks no layout**

The old `icon-sm` was `size-7` (28px), which is off the GWP ladder; it is now `size-8`. Find its call sites and eyeball each:

```bash
grep -rn 'size="icon-sm"' --include='*.tsx' src
```

For each hit, confirm the surrounding row still aligns (a 32px icon button in a 32px-tall toolbar row is correct; one inside a `h-7` container is not). Where a container is `h-7`, raise the container to `h-8` — never shrink the button off the ladder.

- [ ] **Step 4: Verify lint, build and adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 5: Look at a dense toolbar and a dialog footer**

```bash
npm run dev -w @opcreative/dashboard
```

Visit `/orders` (toolbar with `outline` bulk actions plus a `default` "New order") and open the create dialog. Confirm: one Action Blue button per region; pills read as pills; the destructive action is white-with-red-ink, not a red slab; keyboard focus shows the blue glow. Compare against `docs/design-system/screenshots/reference/` for the orders screen.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/ui/button.tsx
git commit -m "refactor(ds): GWP pill buttons

Ports components/core/Button: pill by default, borderless, Action Blue
reserved for one action per region, press-scale instead of the 1px nudge,
DS focus glow. Adds cream/inverse/accent for the Layer 3 shell and a shape
prop for dense toolbars. Uses the real shadcn prop name 'variant', restored
in Task 0b.

destructive is now the DS's danger (white pill, red ink): the system has no
filled-red button and adding one would be a new colour.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Badge, and the StatusBadge that replaces every hand-picked status colour

**Files:**
- Modify: `apps/dashboard/src/components/ui/badge.tsx` (variant block only)
- Create: `apps/dashboard/src/components/ds/status-badge.tsx`
- Create: `apps/dashboard/src/components/ds/index.ts`
- Reference: `docs/design-system/components/core/StatusBadge.d.ts`, `docs/design-system/components/core/StatusBadge.prompt.md`

**Interfaces:**
- Consumes: `toneFor`, `StatusTone` from `./status-tones.ts` (Task 2); `Badge` from `@/components/ui/badge`.
- Produces: `Badge` / `badgeVariants` unchanged in signature (`variant` ∈ `default | secondary | destructive | outline | ghost | link`). New: `StatusBadge` with props `{ status: string; tone?: StatusTone; dot?: boolean; size?: "sm" | "md"; pulse?: boolean; className?: string; children?: React.ReactNode }` — `children` overrides the rendered label so a caller can keep passing its own `t()`-translated string while the *colour* comes from `status`. Tasks 20–26 consume it; Task 20 deletes `orders-table.tsx`'s local `statusVariant()`.

- [ ] **Step 1: Repoint the Badge variants**

In `apps/dashboard/src/components/ui/badge.tsx`, replace only the `variants.variant` object (keep the base string, `useRender` body and exports byte-for-byte, apart from the base string's colour-free tweaks noted below):

```tsx
      variant: {
        // GWP badges are soft pills — a filled Action Blue chip competes with
        // the one primary button a region is allowed.
        default: "bg-navy-100 text-navy-700 [a]:hover:bg-navy-200",
        secondary: "bg-sky-100 text-navy-700 [a]:hover:bg-sky-200",
        destructive:
          "bg-(--status-critical-bg) text-(--status-critical-fg) [a]:hover:bg-(--status-critical-bg)",
        outline:
          "border-(--border-soft) text-navy-700 [a]:hover:bg-sky-50",
        ghost: "text-navy-600 hover:bg-sky-100",
        link: "text-(--text-link) underline-offset-4 hover:underline",
      },
```

In the same file's base string, make two colour-free corrections so badges sit on the GWP type and focus contract: replace `text-xs font-medium` with `text-(length:--fs-meta) font-semibold tracking-(--ls-label)`, and replace `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50` with `focus-visible:shadow-(--shadow-focus)`. Leave `h-5 rounded-full px-2 py-0.5` alone — the geometry is already right.

- [ ] **Step 2: Create the StatusBadge**

Create `apps/dashboard/src/components/ds/status-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

import { toneFor, type StatusTone } from "./status-tones";

/**
 * Status pill for fulfilment, tracking, stock and ticket states — ported from
 * the design system's `components/core/StatusBadge`.
 *
 * Pass the literal backend status string; the component maps it to a tone via
 * the canonical map. Do NOT pass a colour, and do NOT pick a Badge variant by
 * hand at the call site — that is exactly the drift this component exists to
 * stop. `tone` is an escape hatch for statuses outside the known set only.
 *
 * `children` overrides the visible label so a caller keeps its own
 * `t()`-translated text while the colour still derives from `status`. Enum
 * values themselves are data and must never be translated (I18N.md).
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-(--status-success-bg) text-(--status-success-fg)",
  progress: "bg-(--status-progress-bg) text-(--status-progress-fg)",
  info: "bg-(--status-info-bg) text-(--status-info-fg)",
  pending: "bg-(--status-pending-bg) text-(--status-pending-fg)",
  attention: "bg-(--status-attention-bg) text-(--status-attention-fg)",
  critical: "bg-(--status-critical-bg) text-(--status-critical-fg)",
  neutral: "bg-(--status-neutral-bg) text-(--status-neutral-fg)",
};

const DOT_CLASSES: Record<StatusTone, string> = {
  success: "bg-(--status-success-dot)",
  progress: "bg-(--status-progress-dot)",
  info: "bg-(--status-info-dot)",
  pending: "bg-(--status-pending-dot)",
  attention: "bg-(--status-attention-dot)",
  critical: "bg-(--status-critical-dot)",
  neutral: "bg-(--status-neutral-dot)",
};

export type StatusBadgeProps = {
  /** The status text as it exists in the system, e.g. "IN_PRODUCTION", "open". */
  status: string;
  /** Override the auto-mapped tone. Only for statuses outside the known set. */
  tone?: StatusTone;
  dot?: boolean;
  size?: "sm" | "md";
  /** Slow pulse on the dot — for genuinely in-flight states only. */
  pulse?: boolean;
  className?: string;
  /** Replaces the rendered label; the colour still comes from `status`. */
  children?: React.ReactNode;
};

export function StatusBadge({
  status,
  tone,
  dot = true,
  size = "md",
  pulse = false,
  className,
  children,
}: StatusBadgeProps) {
  const resolved = tone ?? toneFor(status);

  return (
    <span
      data-slot="status-badge"
      data-tone={resolved}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap",
        "rounded-(--radius-pill) font-sans font-semibold tracking-(--ls-label)",
        size === "sm"
          ? "h-5 px-2 text-(length:--fs-micro)"
          : "h-6 px-2.5 text-(length:--fs-meta)",
        TONE_CLASSES[resolved],
        className
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            DOT_CLASSES[resolved],
            // prefers-reduced-motion must silence the named keyframe.
            pulse && "animate-pulse motion-reduce:animate-none"
          )}
        />
      )}
      {children ?? status}
    </span>
  );
}
```

- [ ] **Step 3: Create the barrel**

Create `apps/dashboard/src/components/ds/index.ts`. Later tasks append to it; keep it alphabetical.

```ts
/**
 * The ported GoodWoodPrint design-system layer.
 *
 * Everything here is a PORT of a component in docs/design-system/components —
 * same prop contract, rewritten in this app's stack (React 19 + Tailwind v4 +
 * the token layer in src/app/gwp.theme.css). The DS's own .jsx files run only
 * in its sandbox and are never imported.
 *
 * Pages import from "@/components/ds", never from a file inside it.
 */
export { StatusBadge, type StatusBadgeProps } from "./status-badge";
export { STATUS_TONES, toneFor, type StatusTone } from "./status-tones";
```

- [ ] **Step 4: Verify the tone map still passes, plus lint, build, adherence**

```bash
node --test apps/dashboard/src/components/ds/status-tones.test.ts
```

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all four PASS. **StatusBadge has no call sites yet** — adoption happens per page in Layer 4, so that each page's status rendering can be checked against its own reference screenshot. Do not sweep `<Badge>` → `<StatusBadge>` globally here; a global sweep would recolour non-status badges too.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/ui/badge.tsx apps/dashboard/src/components/ds/status-badge.tsx apps/dashboard/src/components/ds/index.ts
git commit -m "refactor(ds): soft GWP badges + the canonical StatusBadge

Badge variants move onto GWP tokens (soft pills, not a filled blue chip that
competes with the one primary button per region). Adds StatusBadge, which
derives its colour from the status string via STATUS_TONES so no call site
picks a status colour by hand. Adoption is per-page in Layer 4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
---

### Task 5: Input, Textarea and the field ink

Both files already use semantic tokens, so Task 1 gave them GWP colours. What is still wrong is the **surface**: GWP fields sit on `--surface-inset` (`#F4FBFE`, the faintest sky), not on `transparent`. A transparent field on a sky page ground disappears; a transparent field on a `--surface-shell` card reads as a hairline box, which is the "generic SaaS drift" failure mode.

**Files:**
- Modify: `apps/dashboard/src/components/ui/input.tsx`
- Modify: `apps/dashboard/src/components/ui/textarea.tsx`
- Reference: `docs/design-system/components/forms/Input.d.ts`, `docs/design-system/components/forms/Input.prompt.md`

**Interfaces:**
- Consumes: the token layer (Task 1).
- Produces: `Input` and `Textarea` at the same paths, unchanged signatures (`React.ComponentProps<"input">` / `<"textarea">`). Tasks 11, 12 and Layer 4 consume them. 40 and 18 files respectively inherit the change with no edit.

- [ ] **Step 1: Replace the `Input` class string**

In `apps/dashboard/src/components/ui/input.tsx`, keep the imports, the function signature and the export exactly as they are; replace only the `cn(...)` first argument:

```tsx
      className={cn(
        // GWP fields are INSET wells: the faintest sky fill with a hairline,
        // not a transparent box. 40px = --control-height; 10px =
        // --radius-control. Placeholder ink sits on the navy-500 contrast
        // floor and is never dimmed with opacity.
        "h-(--control-height) w-full min-w-0 rounded-(--radius-control)",
        "border border-(--border-soft) bg-(--surface-inset) px-3 py-1",
        "font-sans text-(length:--fs-body) text-(--text-body)",
        "transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) outline-none",
        "placeholder:text-(--text-muted)",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-(length:--fs-body-sm) file:font-semibold file:text-(--text-body)",
        "hover:border-(--border-strong)",
        "focus-visible:border-(--border-focus) focus-visible:shadow-(--shadow-focus)",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:border-(--status-critical-fg)",
        className
      )}
```

Note what left: every `dark:` utility (dark mode is a no-op after Task 1, so they were dead weight), `ring-offset-*` (replaced by the DS glow) and `disabled:bg-input/50` (the DS dims the whole control instead of repainting it).

- [ ] **Step 2: Replace the `Textarea` class string**

Same rule — only the `cn(...)` first argument changes:

```tsx
      className={cn(
        // Same inset well as Input, but card radius: a multi-line field is a
        // small surface, not a control.
        "flex field-sizing-content min-h-16 w-full rounded-(--radius-card)",
        "border border-(--border-soft) bg-(--surface-inset) px-3 py-2",
        "font-sans text-(length:--fs-body) leading-(--lh-body) text-(--text-body)",
        "transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) outline-none",
        "placeholder:text-(--text-muted)",
        "hover:border-(--border-strong)",
        "focus-visible:border-(--border-focus) focus-visible:shadow-(--shadow-focus)",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "aria-invalid:border-(--status-critical-fg)",
        className
      )}
```

The old file bumped text to `text-base` on mobile and back to `text-sm` at `md` (an iOS zoom workaround). GWP body is `0.875rem` = 14px at every breakpoint, and iOS zooms below 16px. Keep the workaround explicitly rather than losing it — add this as the last class before `className`:

```tsx
        "max-md:text-base",
```

- [ ] **Step 3: Check for call sites that fought the old transparent background**

```bash
cd apps/dashboard
grep -rn '<Input[^>]*className="[^"]*bg-' --include='*.tsx' src | head -20
grep -rn '<Textarea[^>]*className="[^"]*bg-' --include='*.tsx' src | head -20
```

For each hit, delete the local `bg-*` class: the primitive now owns the field surface. Do not change anything else on those lines — `value`, `onChange`, `name` and validation props are untouchable (rules 1, 6, 7).

- [ ] **Step 4: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 5: Prove a form still submits**

```bash
npm run dev -w @opcreative/dashboard
```

Open `/profile`, change a field, submit. The point is not the look: it is that `profile-form.tsx`'s handler, its zod schema and its server action are untouched and still fire. Then open `/orders` → "New order" and confirm validation errors still render (the field turns `--status-critical-fg`).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/ui/input.tsx apps/dashboard/src/components/ui/textarea.tsx
git commit -m "refactor(ds): GWP inset fields

Ports components/forms/Input: fields are inset wells on --surface-inset with a
hairline and the DS focus glow, not transparent boxes. Drops the dead dark:
utilities and the ring-offset halo; keeps the iOS 16px zoom guard. No call
site, handler or schema changes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Select, native-select and Checkbox

**Files:**
- Modify: `apps/dashboard/src/components/ui/select.tsx` (trigger + content + item classes)
- Modify: `apps/dashboard/src/components/ui/native-select.tsx`
- Modify: `apps/dashboard/src/components/ui/checkbox.tsx`
- Reference: `docs/design-system/components/forms/Select.d.ts`, `docs/design-system/components/forms/Select.prompt.md`

**Interfaces:**
- Consumes: the token layer (Task 1).
- Produces: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` and `NativeSelect` / `Checkbox` — all at the same paths with unchanged signatures. 39 files use Select, 7 use Checkbox; none is edited.

- [ ] **Step 1: Bring the trigger onto the field contract**

`SelectTrigger` must look identical to `Input` — same height, radius, inset fill, hairline and focus glow — or a filter bar reads as two different control families. In `select.tsx`, find the `SelectTrigger` class string and replace its geometry/colour classes with:

```
"h-(--control-height) w-full rounded-(--radius-control) border border-(--border-soft) bg-(--surface-inset) px-3 font-sans text-(length:--fs-body) text-(--text-body) transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) outline-none hover:border-(--border-strong) focus-visible:border-(--border-focus) focus-visible:shadow-(--shadow-focus) disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-(--status-critical-fg) data-[placeholder]:text-(--text-muted)"
```

Keep every non-visual class the file already has — `flex items-center justify-between gap-2`, the `[&_svg]:*` icon rules, `data-slot`, and any `size-*` variant logic. Delete all `dark:` utilities and any `ring-offset-*`.

- [ ] **Step 2: Bring the popup onto the raised-surface contract**

`SelectContent` is a raised surface: white (`--surface-raised`), card radius, the wide faint `--shadow-md`, a hairline. Replace its geometry/colour classes with:

```
"z-50 min-w-(--anchor-width) overflow-hidden rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-raised) p-1 shadow-(--shadow-md)"
```

…preserving whatever animation/positioning classes and `data-*` state selectors the file already carries.

For `SelectItem`, the highlight state in Base UI is **`data-highlighted`**, not `:hover` — this is the documented trap in the repo's own conventions. Its classes become:

```
"relative flex w-full cursor-default items-center gap-2 rounded-(--radius-xs) py-1.5 pr-8 pl-2 font-sans text-(length:--fs-body) text-(--text-body) outline-none select-none data-highlighted:bg-sky-100 data-highlighted:text-navy-700 data-disabled:pointer-events-none data-disabled:opacity-45"
```

The item's base class force-colours descendants via `focus:**:text-accent-foreground` in this shadcn build — if that selector is present, leave it, and colour any icon inside an item with `stroke-*` utilities (immune to it) rather than `text-*`.

- [ ] **Step 3: `native-select.tsx` gets the same field contract**

Give `NativeSelect` the identical geometry/colour string from Step 1. A native select and a custom select in the same form must be indistinguishable.

- [ ] **Step 4: Checkbox — 4px radius is off the GWP ladder**

In `checkbox.tsx`, replace only the `cn(...)` first argument on `CheckboxPrimitive.Root`; keep the `Indicator`, the `CheckIcon` and the export as they are:

```tsx
      className={cn(
        // --radius-xs (8px) is the smallest radius in the system; the old
        // rounded-[4px] was a Geist value. size-4 and the ±3px hit-area
        // expander stay: they are the a11y target, not styling.
        "peer relative flex size-4 shrink-0 items-center justify-center",
        "rounded-(--radius-xs) border border-(--border-soft) bg-(--surface-data)",
        "transition-[background-color,border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) outline-none",
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "hover:border-(--border-strong)",
        "focus-visible:border-(--border-focus) focus-visible:shadow-(--shadow-focus)",
        "disabled:cursor-not-allowed disabled:opacity-45 group-has-disabled/field:opacity-45",
        "aria-invalid:border-(--status-critical-fg)",
        "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        className
      )}
```

- [ ] **Step 5: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 6: Prove selection and filtering still work**

```bash
npm run dev -w @opcreative/dashboard
```

On `/orders`: open the status `Select`, arrow-key down, press Enter. The list must re-filter — that is `params.setFilter` firing, untouched. Confirm the highlighted item is pale sky (proving `data-highlighted` was used, not `:hover`), then click a row checkbox and confirm the bulk-action bar appears.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/components/ui/select.tsx apps/dashboard/src/components/ui/native-select.tsx apps/dashboard/src/components/ui/checkbox.tsx
git commit -m "refactor(ds): selects and checkboxes on the GWP field contract

SelectTrigger and NativeSelect now match Input exactly (inset well, 40px,
10px radius, DS focus glow) so a filter bar reads as one control family.
Popups become raised white surfaces with the wide faint shadow. Item highlight
uses Base UI's data-highlighted, not :hover. Checkbox moves to --radius-xs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Group C sweep — the primitives with no DS equivalent

36 primitives have no GWP counterpart. Most already inherited GWP colours from Task 1 because they were written against semantic tokens. This task finds and fixes the ones that were not, so no Vercel-era detail survives into Layer 2. **No structural change to any of them** — this is a class sweep.

**Files:**
- Modify: whichever files the greps below implicate, among `apps/dashboard/src/components/ui/{accordion,alert,aspect-ratio,attachment,avatar,bubble,button-group,collapsible,combobox,context-menu,dropdown-menu,field,hover-card,input-group,input-otp,item,kbd,label,marker,menubar,message,message-scroller,navigation-menu,popover,progress,radio-group,resizable,scroll-area,separator,slider,spinner,switch,tooltip}.tsx` and `ui/custom/spotlight-card.tsx`
- **Out of scope — owned by another task, do not touch:** `button` `badge` `input` `textarea` `select` `native-select` `checkbox` (Tasks 3–6, already done) · `card` `table` `pagination` `dialog` `alert-dialog` `drawer` `sheet` `tabs` `toggle` `toggle-group` `skeleton` `empty` `sonner` `command` `calendar` `chart` (Tasks 8–14, still to come) · `sidebar` (Task 17)
- Reference: `docs/design-system/A11Y.md` (tooltip, menu and focus contracts)

**Interfaces:**
- Consumes: the token layer (Task 1).
- Produces: no API change anywhere. Every export keeps its name and props.

- [ ] **Step 1: Find every remaining non-token detail**

```bash
cd apps/dashboard/src/components/ui
grep -rn 'ring-offset-\|rounded-\[\|shadow-\[\|text-\[1[0-9]px\]\|dark:' --include='*.tsx' . \
  | grep -vE '/(button|badge|input|textarea|select|native-select|checkbox|card|table|pagination|dialog|alert-dialog|drawer|sheet|tabs|toggle|toggle-group|skeleton|empty|sonner|command|calendar|chart|sidebar)\.tsx' \
  | tee /tmp/gwp-groupc.txt | wc -l
```

The `grep -v` is not optional: the raw grep hits 29 files, 20 of which belong
to other tasks. Sweeping them here means either redundant churn (files Tasks
3–6 already finished) or pre-empting a later task's specific treatment with a
generic one (Tasks 8–14). That list is the task's worklist. Work it top to bottom with these substitutions, and make no other change to any file:

| Found | Replace with | Why |
|---|---|---|
| `ring-offset-2 ring-offset-background` (with its `focus-visible:ring-*`) | `focus-visible:shadow-(--shadow-focus)` | one focus treatment across the app |
| `rounded-[4px]`, `rounded-xs`, `rounded-sm` on a **control** | `rounded-(--radius-control)` | 10px |
| `rounded-md`, `rounded-lg` on a **panel / popup / card** | `rounded-(--radius-card)` | 14px |
| `rounded-full` on a **pill or dot** | keep | already correct |
| `shadow-[...]` or `shadow-md`/`shadow-lg` on a **popup** | `shadow-(--shadow-md)` | blue-tinted, wide, faint |
| any `dark:` utility | delete the utility | dark mode is a no-op after Task 1 |
| `text-[13px]` and friends | `text-(length:--fs-body-sm)` | the DS type ladder |
| a popup background other than `bg-popover` | `bg-(--surface-raised)` | white raised surface |

- [ ] **Step 2: Give every popup surface the same three properties**

`dropdown-menu` (15 call sites — the biggest Group C consumer), `context-menu`, `menubar`, `hover-card`, `popover`, `combobox` and `tooltip` must agree, or the app has four popup styles. Each popup container gets exactly:

```
"rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-raised) shadow-(--shadow-md)"
```

and each of their items gets the highlight treatment from Task 6 Step 2:

```
"rounded-(--radius-xs) data-highlighted:bg-sky-100 data-highlighted:text-navy-700"
```

`tooltip` is the one exception: per `docs/design-system/A11Y.md` it is a small dark chip, not a white panel. Give its content:

```
"rounded-(--radius-control) bg-navy-800 px-2.5 py-1.5 font-sans text-(length:--fs-meta) text-cream-100 shadow-(--shadow-md)"
```

Cream on navy-800 clears 4.5:1; white-on-navy is not used anywhere in the system.

- [ ] **Step 3: Re-run the grep to confirm the worklist is empty**

```bash
cd apps/dashboard/src/components/ui
grep -rn 'ring-offset-\|dark:' --include='*.tsx' . || echo "clean"
```

Expected: `clean`. `rounded-[`/`shadow-[` may legitimately survive in `custom/spotlight-card.tsx` if the value is a geometry, not a colour or radius — check each remaining hit by hand rather than forcing the grep to zero.

- [ ] **Step 4: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 5: Walk the four popup families**

```bash
npm run dev -w @opcreative/dashboard
```

Open, in order: the user menu (top right), a row action menu on `/orders`, the language selector, and any tooltip. All four popups must share one radius, one border, one shadow and one highlight colour; the tooltip must be the dark chip. Keyboard-navigate one menu with arrow keys to confirm `data-highlighted` — not hover — drives the highlight.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/ui
git commit -m "refactor(ds): Group C sweep — one popup, one focus, one radius ladder

The 36 primitives with no GWP counterpart keep their structure and API; only
their classes move onto the token ladder. Unifies every popup surface (radius,
hairline, wide faint shadow, data-highlighted item), replaces the ring-offset
halo with the DS focus glow, and deletes the dark: utilities left dead by the
token remap. Tooltip stays the dark navy chip per A11Y.md.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**LAYER 1 REVIEW GATE.** The app should now read as GWP at the control level — pill buttons, inset fields, soft badges, one popup family — while every page is still laid out exactly as before. No page file has been edited. Confirm that with:

```bash
git diff --stat HEAD~5 -- apps/dashboard/src/components/pages apps/dashboard/src/app
```

Expected: no changes under `components/pages`, and only `globals.css` / `layout.tsx` / `gwp.theme.css` under `src/app`. Anything else means a primitive task leaked into a page.
---

# LAYER 2 — Composite

Seven tasks. Cards, KPI tiles, the table, the toolbar, dialogs, tabs, feedback surfaces and charts. Layer 2 still touches **no page** — every change lands in `src/components/ui/*`, `src/components/global/*` or the new `src/components/ds/*`. After this layer the app reads 60–70% GWP.

---

### Task 8: Surface, Card, SectionHeading and KeyValueRow

The DS's rule is blun: *"Use it for every panel; do not hand-roll a white box with a shadow."* Our `Card` is that box. It gets the GWP surface treatment, and a `Surface` primitive is added for the panels the DS wants explicit about which rung of the ladder they sit on.

**Files:**
- Modify: `apps/dashboard/src/components/ui/card.tsx`
- Create: `apps/dashboard/src/components/ds/surface.tsx`
- Create: `apps/dashboard/src/components/ds/section-heading.tsx`
- Create: `apps/dashboard/src/components/ds/key-value-row.tsx`
- Modify: `apps/dashboard/src/components/ds/index.ts`
- Reference: `docs/design-system/components/data/Surface.d.ts`, `SectionHeading.d.ts`, `KeyValueRow.d.ts` and their `.prompt.md` files

**Interfaces:**
- Consumes: the token layer (Task 1).
- Produces:
  - `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` — unchanged signatures (`Card` keeps `size?: "default" | "sm"`).
  - `Surface` with `{ level?: "canvas" | "content" | "data" | "inset" | "sheet"; radius?: "sm" | "md" | "lg" | "xl" | "2xl" | "card" | "surface" | "hero"; shadow?: "none" | "xs" | "sm" | "md" | "lg"; outline?: boolean; pad?: boolean; title?: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode; className?: string }`.
  - `SectionHeading` with `{ title: React.ReactNode; subtitle?: React.ReactNode; eyebrow?: React.ReactNode; action?: React.ReactNode; className?: string }`.
  - `KeyValueRow` with `{ label: React.ReactNode; value: React.ReactNode; mono?: boolean; className?: string }`.
  - Tasks 10, 12, 14 and Layer 4 consume all four.

- [ ] **Step 1: Bring `Card` onto the surface ladder**

In `apps/dashboard/src/components/ui/card.tsx`, change the class strings only — every function signature, `data-slot`, `--card-spacing` custom property and export stays. Three substitutions:

`Card`: replace `rounded-lg … shadow-ds-2 ring-1 ring-border` and the `rounded-t-lg`/`rounded-b-lg` image rules with

```
"rounded-(--radius-card) bg-card text-(length:--fs-body) text-card-foreground shadow-(--shadow-sm) ring-1 ring-(--border-hairline) *:[img:first-child]:rounded-t-(--radius-card) *:[img:last-child]:rounded-b-(--radius-card)"
```

`CardHeader`: `rounded-t-lg` → `rounded-t-(--radius-card)`.

`CardTitle`: replace `font-heading text-base leading-snug font-medium` with

```
"font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong) group-data-[size=sm]/card:text-(length:--fs-body-lg)"
```

That is a **deliberate use of the display face** — DS rule 4 permits Baloo 2 for page and panel titles. It is rationed: `CardDescription`, `CardContent` and everything else stay Nunito Sans.

`CardFooter`: replace `rounded-b-xl border-t bg-muted/50` with `rounded-b-(--radius-card) border-t border-(--border-hairline) bg-(--surface-content-alt)`. An opacity-tinted footer breaches the "no opacity-based de-emphasis" floor.

`CardAction`'s class string is **already correct** — do not touch it. It reads
`col-start-2 row-span-2 row-start-1 self-start justify-self-end`, which is
verbatim upstream shadcn. Task 0 restored it: the upstream mangle had written
`column-span-2 column-start-1`, and because the swap was the whole word `row`
↔ `column`, the pre-image is `row-span-2 row-start-1` — not `col-*`. The
untouched `col-start-2` on the same line is the proof: `col` was never part of
the swap. If you "fix" this to `col-span-2 col-start-1` you will put two
contradictory `col-start-*` classes on one element.

- [ ] **Step 2: Create `Surface`**

Create `apps/dashboard/src/components/ds/surface.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * The surface primitive that enforces the SKY → SHELL → WHITE hierarchy —
 * ported from the design system's `components/data/Surface`.
 *
 * Reach for this instead of hand-rolling a white box with a shadow. `Card`
 * (components/ui/card) remains the right choice where a header/footer/action
 * grid is wanted; `Surface` is for a plain panel that must declare which rung
 * of the ladder it sits on.
 *
 * Sky is the PAGE, never a rectangular panel trapped inside a card — so
 * `level="canvas"` is for a brand moment inside content, not for a data panel.
 */
const LEVELS = {
  canvas: "bg-(--surface-brand-block) text-navy-700",
  content: "bg-(--surface-content) text-navy-700",
  data: "bg-(--surface-data) text-(--text-body)",
  inset: "bg-(--surface-inset) text-(--text-body)",
  // For panels sitting on the admin sky→white dissolve field: the border and
  // the fading seam do the delineating, not a filled box.
  sheet: "bg-[image:var(--field-sheet)] text-(--text-body)",
} as const;

const RADII = {
  sm: "rounded-(--radius-sm)",
  md: "rounded-(--radius-md)",
  lg: "rounded-(--radius-lg)",
  xl: "rounded-(--radius-xl)",
  "2xl": "rounded-(--radius-2xl)",
  card: "rounded-(--radius-card)",
  surface: "rounded-(--radius-surface)",
  hero: "rounded-(--radius-hero)",
} as const;

const SHADOWS = {
  none: "",
  xs: "shadow-(--shadow-xs)",
  sm: "shadow-(--shadow-sm)",
  md: "shadow-(--shadow-md)",
  lg: "shadow-(--shadow-lg)",
} as const;

export type SurfaceProps = {
  level?: keyof typeof LEVELS;
  radius?: keyof typeof RADII;
  shadow?: keyof typeof SHADOWS;
  /** 1px --border-soft hairline. Required on level="sheet". */
  outline?: boolean;
  pad?: boolean;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Pinned right of the header — a Select, link or small Button. */
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function Surface({
  level = "data",
  radius = "card",
  shadow = "sm",
  outline = false,
  pad = true,
  title,
  subtitle,
  action,
  children,
  className,
}: SurfaceProps) {
  const hasHeader = Boolean(title || subtitle || action);

  return (
    <section
      data-slot="surface"
      data-level={level}
      className={cn(
        LEVELS[level],
        RADII[radius],
        SHADOWS[shadow],
        // The DS makes the hairline mandatory on `sheet`, so it is applied
        // whether or not the caller remembered `outline`.
        (outline || level === "sheet") && "border border-(--border-soft)",
        pad && "p-5",
        className
      )}
    >
      {hasHeader && (
        <header className={cn("flex items-start justify-between gap-4", pad && "mb-4")}>
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong)">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 font-sans text-(length:--fs-body-sm) text-(--text-muted)">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
```

- [ ] **Step 3: Create `SectionHeading`**

Create `apps/dashboard/src/components/ds/section-heading.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * The heading above a group of panels — ported from the design system's
 * `components/data/SectionHeading`.
 *
 * The eyebrow is navy, uppercase and tracked; the title is the display face;
 * the subtitle is navy-500, which is the contrast floor and never dimmed
 * further with opacity.
 */
export type SectionHeadingProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function SectionHeading({
  title,
  subtitle,
  eyebrow,
  action,
  className,
}: SectionHeadingProps) {
  return (
    <div
      data-slot="section-heading"
      className={cn("flex items-end justify-between gap-4", className)}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="font-sans text-(length:--fs-micro) font-bold tracking-(--ls-caps) uppercase text-(--text-label)">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong)">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 font-sans text-(length:--fs-body-sm) text-(--text-muted)">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Create `KeyValueRow`**

Create `apps/dashboard/src/components/ds/key-value-row.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * A label/value pair in a detail panel — ported from the design system's
 * `components/data/KeyValueRow`.
 *
 * `mono` is not decoration: per DS rule 4, order IDs, SKUs, tracking numbers
 * and money are set in IBM Plex Mono. Pass it for those and nothing else.
 */
export type KeyValueRowProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
};

export function KeyValueRow({ label, value, mono = false, className }: KeyValueRowProps) {
  return (
    <div
      data-slot="key-value-row"
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-(--border-hairline) py-2.5 last:border-b-0",
        className
      )}
    >
      <dt className="font-sans text-(length:--fs-body-sm) text-(--text-label)">{label}</dt>
      <dd
        className={cn(
          "text-right text-(length:--fs-body) font-semibold text-(--text-body)",
          mono ? "font-mono tracking-(--ls-mono)" : "font-sans"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
```

- [ ] **Step 5: Extend the barrel**

Add to `apps/dashboard/src/components/ds/index.ts`, keeping it alphabetical:

```ts
export { KeyValueRow, type KeyValueRowProps } from "./key-value-row";
export { SectionHeading, type SectionHeadingProps } from "./section-heading";
export { Surface, type SurfaceProps } from "./surface";
```

- [ ] **Step 6: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS. `Surface`, `SectionHeading` and `KeyValueRow` have no call sites yet — Layer 4 adopts them. `Card`'s three existing call sites re-skin immediately.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/components/ui/card.tsx apps/dashboard/src/components/ds
git commit -m "feat(ds): surface ladder — Surface, SectionHeading, KeyValueRow; Card on tokens

Card moves to --radius-card, the GWP blue-tinted shadow and a hairline ring;
its title takes the display face (a rationed, DS-permitted use). Adds the
Surface primitive so panels declare which rung of the sky/shell/white ladder
they sit on, plus SectionHeading and KeyValueRow. Fixes two Tailwind classes
that never existed (column-span-2 -> col-span-2).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: MetricCard

The DS is emphatic about which variant is canonical: `wash` — a semantic pastel surface, **no border, no shadow**, label and value in the tone's own ink. The white-card-with-icon-chip variant "reads as a generic SaaS KPI card" and is opt-in only. Our `stat-tiles.tsx` and three home screens currently hand-roll the generic version, so building the right primitive first matters.

**Files:**
- Create: `apps/dashboard/src/components/ds/metric-card.tsx`
- Modify: `apps/dashboard/src/components/ds/index.ts`
- Reference: `docs/design-system/components/data/MetricCard.d.ts`, `MetricCard.prompt.md`

**Interfaces:**
- Consumes: the token layer (Task 1).
- Produces: `MetricCard` with `{ label: React.ReactNode; value: React.ReactNode; delta?: React.ReactNode; direction?: "up" | "down"; deltaNote?: React.ReactNode; icon?: React.ReactNode; tone?: "action" | "progress" | "success" | "critical" | "attention" | "pending" | "neutral"; variant?: "wash" | "card" | "tile"; onClick?: () => void; className?: string }`. Tasks 19 (home) and 23 (inventory) adopt it.

- [ ] **Step 1: Create the component**

Create `apps/dashboard/src/components/ds/metric-card.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

/**
 * KPI figure — ported from the design system's `components/data/MetricCard`.
 *
 * `wash` is the DEFAULT and the canonical operational treatment: a semantic
 * pastel surface, no border, no shadow, label and value set in the tone's own
 * ink. That is what the approved operational screens use.
 *
 * `card` (white fill, hairline, tinted icon chip) is SECONDARY and reads as a
 * generic SaaS KPI card. Use it at most for one introductory metric row on a
 * dashboard — never for a whole screen.
 *
 * The value is the one place a KPI earns the display face (DS rule 4), and it
 * is navy: "display ink follows the surface", and these surfaces are pale.
 */
const TONES = {
  action: { wash: "bg-(--wash-blue)", ink: "text-(--action-600)" },
  progress: { wash: "bg-(--status-progress-bg)", ink: "text-(--status-progress-fg)" },
  success: { wash: "bg-(--status-success-bg)", ink: "text-(--status-success-fg)" },
  critical: { wash: "bg-(--status-critical-bg)", ink: "text-(--status-critical-fg)" },
  attention: { wash: "bg-(--status-attention-bg)", ink: "text-(--status-attention-fg)" },
  pending: { wash: "bg-(--status-pending-bg)", ink: "text-(--status-pending-fg)" },
  neutral: { wash: "bg-(--surface-shell)", ink: "text-(--text-body)" },
} as const;

export type MetricCardProps = {
  label: React.ReactNode;
  /** The number. Rendered in the display face. */
  value: React.ReactNode;
  /** Change figure, e.g. "18.2%". */
  delta?: React.ReactNode;
  /** `up` renders green, `down` red. Semantics, not literal direction. */
  direction?: "up" | "down";
  /** Comparison note, e.g. "vs last 7 days". */
  deltaNote?: React.ReactNode;
  /** A lucide stroke icon — 15–16px inline in `wash`, 18–20px in the chip on `card`. */
  icon?: React.ReactNode;
  /** Match the tone to the metric's MEANING, not to variety. */
  tone?: keyof typeof TONES;
  variant?: "wash" | "card" | "tile";
  onClick?: () => void;
  className?: string;
};

export function MetricCard({
  label,
  value,
  delta,
  direction,
  deltaNote,
  icon,
  tone = "neutral",
  variant = "wash",
  onClick,
  className,
}: MetricCardProps) {
  const t = TONES[tone];
  // `tile` is a compatibility alias for `wash`.
  const isCard = variant === "card";
  const interactive = Boolean(onClick);

  const body = (
    <>
      <div className="flex items-center gap-2">
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex shrink-0 items-center justify-center",
              isCard
                ? cn("size-9 rounded-(--radius-control)", t.wash, t.ink, "[&_svg]:size-5")
                : cn(t.ink, "[&_svg]:size-4")
            )}
          >
            {icon}
          </span>
        )}
        <p
          className={cn(
            "font-sans text-(length:--fs-meta) font-bold tracking-(--ls-caps) uppercase",
            isCard ? "text-(--text-label)" : t.ink
          )}
        >
          {label}
        </p>
      </div>

      {/* KPI numbers are navy in the display face — the DS's own rule, and the
          reason `wash` tints the surface rather than the numeral. */}
      <p className="mt-2 font-display text-(length:--fs-display-md) leading-(--lh-display) font-(--fw-display) text-(--display-kpi)">
        {value}
      </p>

      {(delta || deltaNote) && (
        <p className="mt-1 flex items-baseline gap-1.5 font-sans text-(length:--fs-body-sm)">
          {delta && (
            <span
              className={cn(
                "font-bold",
                direction === "up" && "text-(--status-success-fg)",
                direction === "down" && "text-(--status-critical-fg)",
                !direction && "text-(--text-body)"
              )}
            >
              {delta}
            </span>
          )}
          {deltaNote && <span className="text-(--text-muted)">{deltaNote}</span>}
        </p>
      )}
    </>
  );

  const shell = cn(
    "block w-full rounded-(--radius-card) p-4 text-left",
    isCard
      ? "border border-(--border-hairline) bg-(--surface-data) shadow-(--shadow-xs)"
      : cn(t.wash, "border-0 shadow-none"),
    interactive &&
      "transition-shadow duration-(--dur-fast) ease-(--ease-out) hover:shadow-(--shadow-sm) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none",
    className
  );

  if (!interactive) {
    return (
      <div data-slot="metric-card" data-tone={tone} className={shell}>
        {body}
      </div>
    );
  }

  return (
    <button type="button" data-slot="metric-card" data-tone={tone} onClick={onClick} className={shell}>
      {body}
    </button>
  );
}
```

- [ ] **Step 2: Extend the barrel**

```ts
export { MetricCard, type MetricCardProps } from "./metric-card";
```

- [ ] **Step 3: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS. No call sites yet — Tasks 19 and 23 adopt it.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/ds/metric-card.tsx apps/dashboard/src/components/ds/index.ts
git commit -m "feat(ds): MetricCard, wash variant canonical

Ports components/data/MetricCard. Default is the DS's canonical wash: a
semantic pastel surface with no border or shadow and the tone's own ink. The
white-card-with-icon-chip variant is opt-in, because the DS calls it generic
SaaS. KPI numerals take the display face in navy.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
---

### Task 10: Table and DataTable — the load-bearing Group B adapter

This is the task the spec singles out. The DS `DataTable` takes `rows` and `columns` and nothing else. Ours already carries sorting, selection, server-side filtering, row actions, permissions, loading/empty/error precedence and a mobile-card mode. **Rule 8 says do not rewrite a working feature to match the DS API, and rule 9 says adapt.** So the app-level `DataTable` keeps its exact signature and we reskin its internals; the DS's look arrives, the page learns nothing.

The DS's rules for this surface are specific and testable: *horizontal row rules only, no vertical grid, no grey header fill, frameless `surface="field"` variant, 56/48px rows*. Also: IDs and money in mono, status always a `StatusBadge` (never coloured text), row actions as ghost icon buttons in the last column.

**Files:**
- Modify: `apps/dashboard/src/components/ui/table.tsx`
- Modify: `apps/dashboard/src/components/global/data-table/data-table.tsx` (class strings only)
- Reference: `docs/design-system/components/data/DataTable.d.ts`, `DataTable.prompt.md`

**Interfaces:**
- Consumes: `Card`/`Surface` tokens (Task 8), `Checkbox` (Task 6), `Skeleton` (Task 13 reskins it later — the class here is unaffected).
- Produces: **no signature change anywhere.** `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption` keep their props; `DataTable<T>`, `Column<T>`, `SortState`, `DataTableProps<T>` are byte-identical in type. Every current caller — `orders-table`, `users-table`, `audit-table`, `boms-table`, `materials-table`, `mockups-table`, `products-table`, `transactions-table`, `variants-table`, `vendors-table`, `warehouses-table`, `movements-table`, `receipts-table`, `stock-table`, `monitor-table`, `tickets-table`, `profile/transactions-table` — is untouched.

- [ ] **Step 1: Rewrite the `table.tsx` class strings**

Keep every function, signature, `data-slot` and export. Replace the class strings as follows.

`Table` — the DS wants the table frameless inside a white surface, so the container drops its own border and the table gets the body type:

```tsx
      className={cn("w-full caption-bottom border-separate border-spacing-0 font-sans text-(length:--fs-body)", className)}
```

`TableHeader` — **no grey header fill.** The header is the same white as the body; only a rule under it separates:

```tsx
      className={cn("[&_tr]:border-0 [&_th]:border-b [&_th]:border-(--border-soft)", className)}
```

`TableBody` — horizontal rules only, and none after the last row:

```tsx
      className={cn("[&_td]:border-b [&_td]:border-(--border-hairline) [&_tr:last-child_td]:border-0", className)}
```

`TableFooter`:

```tsx
      className={cn("border-t border-(--border-soft) bg-(--surface-content-alt) font-semibold", className)}
```

`TableRow` — GWP row states are pale sky, not a grey tint, and never an opacity wash:

```tsx
      className={cn(
        "transition-colors duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none",
        "hover:bg-sky-50 has-aria-expanded:bg-sky-50 data-[state=selected]:bg-sky-100",
        className
      )}
```

`TableHead` — 48px header row, label ink, no vertical rules:

```tsx
      className={cn(
        "h-12 px-3 text-left align-middle whitespace-nowrap",
        "font-sans text-(length:--fs-meta) font-bold tracking-(--ls-caps) uppercase text-(--text-label)",
        "[&:has([role=checkbox])]:pr-0",
        className
      )}
```

`TableCell` — 56px data rows come from vertical padding on the cell:

```tsx
      className={cn("px-3 py-4 align-middle whitespace-nowrap text-(--text-body)", className)}
```

`TableCaption`:

```tsx
      className={cn("mt-4 font-sans text-(length:--fs-body-sm) text-(--text-muted)", className)}
```

Note `border-separate border-spacing-0` on `Table`: it is what lets per-cell bottom borders draw as continuous row rules while no vertical border exists anywhere. Do not switch it back to `border-collapse` — that reintroduces the grid.

- [ ] **Step 2: Reskin the `DataTable` wrapper — class strings only**

In `apps/dashboard/src/components/global/data-table/data-table.tsx`, change exactly five class strings. **Touch nothing else**: `toggleAll`, `toggleOne`, `nextSortFor`, the error-beats-loading-beats-empty precedence, `stopPropagation` on the checkbox cell, `useId`, `useIsMobile` and every prop must stay identical.

1. The table container (line ~200) — the DS puts the table inside a **white** surface, frameless:

```tsx
      <div className="overflow-x-auto rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-data) shadow-(--shadow-xs)">
```

2. The sort button (line ~229):

```tsx
                        className="-mx-1 inline-flex items-center gap-1 rounded-(--radius-xs) px-1 text-(--text-label) transition-colors duration-(--dur-fast) hover:text-(--text-body) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
```

Leave the `ChevronsUpDown … opacity-40` alone: it is a 14px **icon**, not small text, so the contrast floor's "no opacity-based de-emphasis on small text" rule does not reach it.

3. The empty-state cell (line ~283):

```tsx
                  className="py-10 text-center font-sans text-(length:--fs-body) text-(--text-muted)"
```

4. The mobile-card `<li>` (line ~168):

```tsx
                    "rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-data) p-3 transition-colors duration-(--dur-fast) motion-reduce:transition-none",
                    selectable && selected!.has(id) && "border-(--action-200) bg-sky-50",
```

The old selected state was `border-foreground/30 bg-accent/40` — two opacity washes, which the DS forbids. The replacement uses real tokens.

5. The mobile skeleton and mobile empty/error text (lines ~150-163):

```tsx
              <Skeleton key={`card-skeleton-${i}`} className="h-28 w-full rounded-(--radius-card)" />
```

```tsx
          <p className="py-10 text-center font-sans text-(length:--fs-body) text-(--status-critical-fg)">{error}</p>
```

```tsx
          <p className="py-10 text-center font-sans text-(length:--fs-body) text-(--text-muted)">{empty}</p>
```

- [ ] **Step 3: Prove the signature did not move**

```bash
cd apps/dashboard
git diff -- src/components/global/data-table/data-table.tsx | grep -E '^[-+]' | grep -vE '^[-+]{3}' | grep -vE 'className|^\+\s*$|^-\s*$' || echo "only class strings changed"
```

Expected: `only class strings changed`. **If that prints anything else, revert and redo the step** — a logic diff in this file is a rule-1 violation, and the 17 tables downstream are the app's entire admin surface.

- [ ] **Step 4: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 5: Walk the table's nine behaviours on one real page**

```bash
npm run dev -w @opcreative/dashboard
```

On `/orders`, confirm each of these still works — this is the Group B adapter's whole justification, so none may be taken on trust:

- [ ] sort a column (asc → desc → none, three clicks return the default order)
- [ ] the sorted column shows `aria-sort` (inspect the `<th>`)
- [ ] select one row (checkbox), and the row turns pale sky
- [ ] select all on the page (header checkbox), then page forward and back — the selection survives, because `toggleAll` only ever touches the current page
- [ ] click a row (not the checkbox) and the row-click handler fires
- [ ] click a checkbox and the row-click handler does **not** fire
- [ ] filter to zero results → the empty state shows, not skeletons
- [ ] resize to a phone width → cards replace the table and the checkbox still selects
- [ ] visually: horizontal rules only, no vertical grid lines, no grey header band, 48px header / 56px rows

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/ui/table.tsx apps/dashboard/src/components/global/data-table/data-table.tsx
git commit -m "refactor(ds): GWP table look behind the existing DataTable adapter

The DS DataTable takes rows/columns only; ours carries sort, selection, server
filtering, row actions, permissions and mobile cards. Per migration rules 8/9
the signature is untouched and only the internals are reskinned: horizontal
row rules only, no vertical grid, no grey header fill, white frameless
surface, 48px header / 56px rows, pale-sky row states instead of opacity
washes. All 17 downstream tables inherit it with no edit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Toolbar, SearchField, FilterChip and Pagination

**Files:**
- Modify: `apps/dashboard/src/components/global/data-table/data-table-toolbar.tsx`
- Modify: `apps/dashboard/src/components/global/data-table/data-table-pagination.tsx`
- Modify: `apps/dashboard/src/components/ui/pagination.tsx`
- Create: `apps/dashboard/src/components/ds/search-field.tsx`
- Create: `apps/dashboard/src/components/ds/filter-chip.tsx`
- Modify: `apps/dashboard/src/components/global/search/SearchInput.tsx`, `SearchDropdown.tsx`, `SearchResultItem.tsx` (class strings only)
- Modify: `apps/dashboard/src/components/ds/index.ts`
- Reference: `docs/design-system/components/forms/SearchField.d.ts`, `FilterChip.d.ts`, `docs/design-system/components/navigation/Pagination.d.ts`

**Interfaces:**
- Consumes: `Input` (Task 5), `Button` (Task 3), `Select` (Task 6).
- Produces:
  - `DataTableToolbar` and `DataTablePagination` — **unchanged props** (`search`, `onSearchChange`, `searchPlaceholder`, `filters`, `actions`, `selectedCount`, `bulkActions`, `onClearFilters`, `hasFilters`; and `page`, `pageSize`, `total`, `onPageChange`, `onPageSizeChange`, `selectedCount`).
  - `SearchField` with `{ value: string; onChange: (v: string) => void; placeholder?: string; "aria-label"?: string; className?: string }`.
  - `FilterChip` with `{ label: React.ReactNode; active?: boolean; count?: number; onClick?: () => void; className?: string }`.
  - Task 20 uses `FilterChip` for the Orders tab strip; Layer 4 tasks use `SearchField`.

**A real bug to fix while here (not a redesign):** both `data-table-toolbar.tsx` and `data-table-pagination.tsx` contain `sm:flex-column`, which is not a Tailwind class and has never compiled to anything. The intent — and the `sm:items-center sm:justify-between` beside it — is `sm:flex-row`. Toolbars and pagination bars have therefore been stacking vertically at every breakpoint. Fix both occurrences to `sm:flex-row`. This preserves every interaction (rule 10) and repairs a layout that was never working.

- [ ] **Step 1: Create `SearchField`**

Create `apps/dashboard/src/components/ds/search-field.tsx`:

```tsx
"use client";

import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * The search control — ported from the design system's
 * `components/forms/SearchField`.
 *
 * Presentation only: it holds no debounce and no URL state. The toolbar owns
 * the 300ms debounce and the URL push, and that logic is untouched by this
 * migration. A clear button appears once there is a value, because a filtered
 * list with no visible way back is the DS's documented empty-state trap.
 */
export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
};

export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  className,
  ...rest
}: SearchFieldProps) {
  return (
    <div data-slot="search-field" className={cn("relative", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 stroke-(--text-muted)"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={rest["aria-label"] ?? placeholder}
        className={cn("pl-9", value && "pr-9")}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-(--radius-pill) text-(--text-muted) transition-colors duration-(--dur-fast) hover:bg-sky-100 hover:text-(--text-body) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `FilterChip`**

Create `apps/dashboard/src/components/ds/filter-chip.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

/**
 * A canned filter — ported from the design system's
 * `components/forms/FilterChip`.
 *
 * Chips are FILTERS, not navigation: they carry `aria-pressed`, not
 * `aria-current`. The active chip is an Action Blue fill; inactive chips are
 * white pills with navy ink so a strip of them does not compete with the one
 * primary button the region is allowed.
 */
export type FilterChipProps = {
  label: React.ReactNode;
  active?: boolean;
  count?: number;
  onClick?: () => void;
  className?: string;
};

export function FilterChip({ label, active = false, count, onClick, className }: FilterChipProps) {
  return (
    <button
      type="button"
      data-slot="filter-chip"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-(--radius-pill) px-3.5",
        "font-sans text-(length:--fs-body-sm) font-bold tracking-(--ls-label) whitespace-nowrap",
        "transition-colors duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none",
        "focus-visible:shadow-(--shadow-focus) focus-visible:outline-none",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-(--surface-data) text-navy-700 shadow-(--shadow-xs) hover:bg-sky-50",
        className
      )}
    >
      {label}
      {typeof count === "number" && (
        <span
          className={cn(
            "rounded-(--radius-pill) px-1.5 font-mono text-(length:--fs-micro)",
            active ? "bg-cream-100/25 text-primary-foreground" : "bg-sky-100 text-navy-600"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Rework the toolbar's markup to use `SearchField`**

In `data-table-toolbar.tsx`, keep the entire component body above the `return` byte-for-byte — the render-phase re-sync, the 300ms debounce effect and every prop must not move (rules 1, 2, 7). Replace only the returned JSX:

```tsx
  return (
    <div
      data-slot="data-table-toolbar"
      className="flex flex-col gap-3 rounded-(--radius-card) bg-(--surface-shell) p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {onSearchChange && (
          <SearchField
            value={draft}
            onChange={setDraft}
            placeholder={searchPlaceholder}
            className="w-full sm:max-w-xs"
          />
        )}

        {selectedCount > 0 && bulkActions ? bulkActions : filters}

        {hasFilters && onClearFilters && selectedCount === 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="size-4" />
            Clear
          </Button>
        )}
      </div>

      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
```

Swap the imports accordingly: drop `Search` and `Input`, add `SearchField`:

```tsx
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ds";
```

The `bg-(--surface-shell)` wrapper is the DS's filter-bar surface — the toolbar becomes the shell rung, with the white table nested below it. That is the sky → shell → white ladder working as designed.

- [ ] **Step 4: Reskin the pagination**

In `data-table-pagination.tsx`, keep `pageCount`/`first`/`last` and every handler exactly as they are. Change three things:

The wrapper — fixing `flex-column`:

```tsx
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
```

The count text:

```tsx
      <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">
```

The page indicator — page numbers are figures, so they take mono:

```tsx
        <span className="px-1 font-mono text-(length:--fs-body-sm) whitespace-nowrap text-(--text-body)">
```

The two arrow buttons already use `variant="outline" size="icon"` and pick up GWP from Task 3. Leave them.

Then give `apps/dashboard/src/components/ui/pagination.tsx` the same treatment as Task 7's Group C sweep (its link items become `rounded-(--radius-pill)` with `data-highlighted`/`aria-current` states in Action Blue). It has zero call sites today, so this is future-proofing; do not spend long on it.

- [ ] **Step 5: Reskin the global search surfaces**

`SearchInput.tsx`, `SearchDropdown.tsx` and `SearchResultItem.tsx` are class-string-only changes. **`useHybridSearch`, `useSearchKeyboard`, `types.ts` and `search.tsx`'s logic must not be touched** (rules 1, 2). Apply:

- `SearchInput` → use the same field contract as Task 5 (inset well, 40px, 10px radius, DS focus glow), or replace its markup with `<SearchField>` if its props allow it without changing its own signature.
- `SearchDropdown` → the popup contract from Task 7 Step 2: `rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-raised) shadow-(--shadow-md)`.
- `SearchResultItem` → `data-highlighted:bg-sky-100 data-highlighted:text-navy-700 rounded-(--radius-xs)`, with any SKU or ID in the row set in `font-mono`.

- [ ] **Step 6: Extend the barrel**

```ts
export { FilterChip, type FilterChipProps } from "./filter-chip";
export { SearchField, type SearchFieldProps } from "./search-field";
```

- [ ] **Step 7: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 8: Prove search, filter, paging and clear all still work**

```bash
npm run dev -w @opcreative/dashboard
```

On `/orders`:

- [ ] type in the search box — the input updates instantly, the URL updates once after ~300ms (watch the address bar), and the list re-queries **once**
- [ ] click the new clear (×) button — the query empties and the list resets
- [ ] the toolbar now sits **horizontally** from `sm` up (this is the `flex-column` fix; it stacked at every width before)
- [ ] change rows-per-page — the list re-queries and the page resets as it did before
- [ ] page forward and back with the arrows; the arrows disable at the ends
- [ ] select rows — the count text switches to "N selected" and `bulkActions` replaces `filters`
- [ ] press ⌘K / Ctrl-K for the global search, arrow through results, press Enter

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/src/components/global/data-table apps/dashboard/src/components/ui/pagination.tsx apps/dashboard/src/components/global/search apps/dashboard/src/components/ds
git commit -m "refactor(ds): toolbar, search field, filter chips and pagination

Toolbar becomes the DS filter-bar surface (--surface-shell) with the white
table nested below it, and its search box becomes the ported SearchField with
a clear button. Adds FilterChip for canned status filters (aria-pressed, not
aria-current). Page numbers take mono. The 300ms debounce, the render-phase
URL re-sync and every prop are untouched.

Also fixes 'sm:flex-column' in the toolbar and pagination — not a Tailwind
class, so both bars had been stacking vertically at every breakpoint.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
---

### Task 12: Modal, Drawer, Sheet and the form dialog

**Files:**
- Modify: `apps/dashboard/src/components/ui/dialog.tsx`
- Modify: `apps/dashboard/src/components/ui/drawer.tsx`
- Modify: `apps/dashboard/src/components/ui/sheet.tsx`
- Modify: `apps/dashboard/src/components/ui/alert-dialog.tsx`
- Modify: `apps/dashboard/src/components/global/form/form-dialog.tsx`, `responsive-dialog.tsx`, `form-field.tsx`
- Reference: `docs/design-system/components/feedback/Modal.d.ts`, `Modal.prompt.md`, `Drawer.d.ts`, `Drawer.prompt.md`

**Interfaces:**
- Consumes: `Button` (Task 3), `Input`/`Textarea` (Task 5), `Card` tokens (Task 8).
- Produces: no signature changes. `Dialog*`, `Drawer*`, `Sheet*`, `AlertDialog*` keep their exports and props; `FormDialog`, `ResponsiveDialog` and `FormField` keep theirs. **`use-form-action.ts` is not touched** — it carries the submit lifecycle, and that is business logic.

There are ~40 dialogs across `components/pages/**` (`order-dialog`, `import-dialog`, `refund-dialog`, `assign-dialog`, `artwork-dialog`, `delete-orders-dialog`, `bom-dialog`, `material-dialog`, `mockup-dialog`, `product-dialog`, `variant-dialog`, `vendor-dialog`, `warehouse-dialog`, `warehouse-members-dialog`, `invite-user-dialog`, `edit-user-dialog`, `balance-dialog`, `user-status-dialog`, `approve-dialog`, `category-dialog`, `entry-dialog`, `adjust-stock-dialog`, `import-stock-dialog`, `receipt-form-dialog`, `receipt-detail-dialog`, `ticket-form-dialog`, `confirm-scan-dialog`, `already-scanned-dialog`, `handoff-dialog`, `link-label-dialog`, `attach-variants-dialog`, `bulk-prices-dialog`, `money-request-dialogs`, the three `delete-*-dialog`s and `sku-grid`'s inline ones). **None of them is edited in this task.** They all render through these four primitives plus `FormDialog`, so reskinning here reaches all of them.

- [ ] **Step 1: The scrim**

Every overlay in the app uses the same scrim token. In each of `dialog.tsx`, `drawer.tsx`, `sheet.tsx`, `alert-dialog.tsx`, find the `*Overlay`/`*Backdrop` component and set its background to:

```
"bg-(--overlay-scrim)"
```

That is `rgba(9,39,64,0.34)` — a navy scrim, not black. Delete any `bg-black/50`, `bg-background/80` or `backdrop-blur-*` you find there: the DS separates a modal from the page with a navy veil and the modal's own shadow, not with a blur.

- [ ] **Step 2: The modal panel**

In `dialog.tsx` and `alert-dialog.tsx`, the `*Content` panel becomes a raised white surface with the deepest shadow in the ladder:

```
"rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-raised) shadow-(--shadow-lg)"
```

Its title takes the display face — a modal title is a page-level title, which DS rule 4 permits:

```
"font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong)"
```

Its description:

```
"font-sans text-(length:--fs-body-sm) text-(--text-muted)"
```

If the footer has a `border-t`, make it `border-(--border-hairline)`; if it has a tinted fill, remove the fill — a modal footer is the same surface as its body.

- [ ] **Step 3: The drawer / sheet panel**

The DS gives drawers their own shadow token, `--shadow-drawer` (`-24px 0 64px -32px rgba(9,39,64,0.28)`) — a directional shadow cast back onto the page from a right-hand edge. In `drawer.tsx` and `sheet.tsx`, the panel becomes:

```
"border-(--border-hairline) bg-(--surface-raised) shadow-(--shadow-drawer)"
```

Keep each side-variant's own radius rules, but express them in tokens: a right-side drawer is `rounded-l-(--radius-card)`, a bottom sheet `rounded-t-(--radius-xl)` (a bottom sheet is a bigger gesture and takes the larger radius), and full-height side panels keep square outer edges.

The drag handle on the mobile drawer becomes `bg-(--border-strong)`.

- [ ] **Step 4: `FormDialog`, `ResponsiveDialog`, `FormField`**

These three are Group B adapters that already exist and already do the right thing structurally. Class-string changes only:

- `form-dialog.tsx` — the footer's action row: the confirm button stays `variant="default"` (one Action Blue per region — a dialog is a region), the cancel stays `variant="ghost"`. If the file hard-codes a width like `sm:max-w-lg`, leave it: dialog sizing is layout the pages depend on.
- `responsive-dialog.tsx` — it switches between `Dialog` and `Drawer` at a breakpoint. Do not change the breakpoint or the switch logic; it inherits Steps 2 and 3 automatically. Verify by reading it that nothing else needs touching.
- `form-field.tsx` — the label becomes `font-sans text-(length:--fs-body-sm) font-semibold text-(--text-body)`; the error message becomes `font-sans text-(length:--fs-meta) text-(--status-critical-fg)`; any helper text becomes `text-(--text-muted)`. Do **not** touch how it reads errors from the form state (rule 6).

- [ ] **Step 5: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 6: Exercise one dialog of each kind, end to end**

```bash
npm run dev -w @opcreative/dashboard
```

- [ ] **Create form** — `/orders` → "New order": fields render as inset wells, submit works, a validation error paints the field red and shows the message, Escape closes, the scrim is navy.
- [ ] **Destructive confirm** — select orders → Delete: the confirm button is white-with-red-ink (Task 3), the action still deletes, cancel still cancels.
- [ ] **Responsive** — open the same dialog at a phone width: it becomes a bottom sheet with the larger top radius and the drag handle.
- [ ] **Drawer** — open a row detail drawer (or `/tickets/[id]`): the drawer casts `--shadow-drawer` back over the page, and focus is trapped.
- [ ] **Upload** — `/orders` → Import: file input still accepts a file and the import still runs.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/components/ui/dialog.tsx apps/dashboard/src/components/ui/drawer.tsx apps/dashboard/src/components/ui/sheet.tsx apps/dashboard/src/components/ui/alert-dialog.tsx apps/dashboard/src/components/global/form
git commit -m "refactor(ds): navy scrim, raised modal panels, directional drawer shadow

Every overlay in the app moves to --overlay-scrim (a navy veil, not black, and
no backdrop blur). Modal panels become raised white surfaces with the deep
shadow and a display-face title; drawers take the DS's directional
--shadow-drawer. FormDialog/ResponsiveDialog/FormField get class changes only
— use-form-action and the schemas are untouched. All ~40 page dialogs inherit
this without an edit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Tabs, SegmentedControl, and the four feedback states

`docs/design-system/STATES.md` is the contract here: it gives the loading / empty / error / no-permission / disabled matrix per surface, each mapped to the component that renders it and the real gate that triggers it. Read it before starting.

**Files:**
- Modify: `apps/dashboard/src/components/ui/tabs.tsx`
- Modify: `apps/dashboard/src/components/ui/toggle-group.tsx`, `toggle.tsx`
- Modify: `apps/dashboard/src/components/ui/skeleton.tsx`
- Modify: `apps/dashboard/src/components/ui/empty.tsx`
- Modify: `apps/dashboard/src/components/ui/sonner.tsx`
- Modify: `apps/dashboard/src/components/ui/command.tsx`
- Create: `apps/dashboard/src/components/ds/callout.tsx`
- Create: `apps/dashboard/src/components/ds/loading-state.tsx`
- Modify: `apps/dashboard/src/components/ds/index.ts`
- Reference: `docs/design-system/STATES.md`, `components/navigation/TabBar.d.ts`, `components/forms/SegmentedControl.d.ts`, `components/feedback/{Callout,EmptyState,LoadingState,Skeleton,Toast,CommandPalette}.d.ts`

**Interfaces:**
- Consumes: `Button` (Task 3), `Surface` (Task 8).
- Produces: unchanged signatures for all six `ui/*` files. New: `Callout` with `{ tone?: "info" | "attention" | "critical" | "success"; title?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }`; `LoadingState` with `{ label?: React.ReactNode; rows?: number; className?: string }`. Layer 4 adopts both.

- [ ] **Step 1: Tabs become the DS TabBar**

In `tabs.tsx`: the tab **list** loses any pill-track background — the DS tab bar is a row of labels with an Action Blue underline on the active one, sitting directly on its surface:

```
"inline-flex items-center gap-1 border-b border-(--border-soft)"
```

Each **trigger**:

```
"relative inline-flex h-10 items-center px-3 font-sans text-(length:--fs-body) font-semibold text-(--text-label) transition-colors duration-(--dur-fast) ease-(--ease-out) hover:text-(--text-body) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none data-[selected]:text-(--action-600) data-[selected]:after:absolute data-[selected]:after:inset-x-2 data-[selected]:after:-bottom-px data-[selected]:after:h-0.5 data-[selected]:after:rounded-full data-[selected]:after:bg-(--action-500)"
```

Check the actual selected-state attribute in this Base UI build before committing to `data-[selected]` — read the file and match what it already uses (it may be `data-selected` or `aria-selected`). Do not guess; the wrong selector silently produces a tab bar with no active state.

- [ ] **Step 2: ToggleGroup becomes the SegmentedControl**

The DS segmented control is a single pill track with a filled active segment — visually distinct from tabs, because it filters rather than navigates. In `toggle-group.tsx`, the root:

```
"inline-flex items-center gap-0.5 rounded-(--radius-pill) bg-(--surface-inset) p-1"
```

and each item:

```
"inline-flex h-8 items-center rounded-(--radius-pill) px-3 font-sans text-(length:--fs-body-sm) font-bold text-(--text-label) transition-colors duration-(--dur-fast) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none data-pressed:bg-(--surface-data) data-pressed:text-(--action-600) data-pressed:shadow-(--shadow-xs)"
```

Again, confirm the pressed-state attribute against the file rather than assuming `data-pressed`.

- [ ] **Step 3: Skeleton**

```
"animate-pulse rounded-(--radius-control) bg-(--surface-inset) motion-reduce:animate-none"
```

The `motion-reduce:animate-none` is not optional — it is in the DS's per-screen definition of done.

- [ ] **Step 4: `Callout`**

Create `apps/dashboard/src/components/ds/callout.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * An inline notice — ported from the design system's
 * `components/feedback/Callout`.
 *
 * A callout is a semantic wash with the tone's own ink, matching StatusBadge
 * and MetricCard so one meaning has one colour across the whole app. Not a
 * toast: this stays on the page and does not time out.
 */
const TONES = {
  info: "bg-(--status-info-bg) text-(--status-info-fg)",
  attention: "bg-(--status-attention-bg) text-(--status-attention-fg)",
  critical: "bg-(--status-critical-bg) text-(--status-critical-fg)",
  success: "bg-(--status-success-bg) text-(--status-success-fg)",
} as const;

export type CalloutProps = {
  tone?: keyof typeof TONES;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function Callout({
  tone = "info",
  title,
  icon,
  action,
  children,
  className,
}: CalloutProps) {
  return (
    <div
      data-slot="callout"
      data-tone={tone}
      className={cn(
        "flex items-start gap-3 rounded-(--radius-card) p-4",
        TONES[tone],
        className
      )}
    >
      {icon && (
        <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-4">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && (
          <p className="font-sans text-(length:--fs-body) font-bold">{title}</p>
        )}
        <div className={cn("font-sans text-(length:--fs-body-sm)", title && "mt-1")}>
          {children}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 5: `LoadingState`**

Create `apps/dashboard/src/components/ds/loading-state.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The loading surface for a panel — ported from the design system's
 * `components/feedback/LoadingState`.
 *
 * Skeleton rows, never a spinner on a data surface: per STATES.md, a spinner
 * says "something is happening" where a skeleton says "this much content is
 * coming". `aria-busy` + a live label is how a screen reader learns the same.
 */
export type LoadingStateProps = {
  label?: React.ReactNode;
  rows?: number;
  className?: string;
};

export function LoadingState({ label, rows = 4, className }: LoadingStateProps) {
  return (
    <div
      data-slot="loading-state"
      aria-busy="true"
      aria-live="polite"
      className={cn("flex flex-col gap-2", className)}
    >
      {label && (
        <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">{label}</p>
      )}
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={`loading-row-${i}`} className="h-10 w-full" />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: `Empty`, `Toast` and `CommandPalette`**

- `ui/empty.tsx` → the DS `EmptyState`: centred, `--surface-shell` ground, `rounded-(--radius-card)`, a display-face title, `--text-muted` body, and an optional primary action. An empty state must say what to do next, not only that there is nothing — check `STATES.md` for the wording pattern before writing copy, and route any new string through `t()` in all seven locales.
- `ui/sonner.tsx` → set the Sonner theme options so a toast is a raised white surface: `rounded-(--radius-card)`, `bg-(--surface-raised)`, `shadow-(--shadow-md)`, `border-(--border-hairline)`, body type `--fs-body-sm`. Map its success/error/warning/info variants onto the four status washes, so a toast and a `Callout` of the same meaning are the same colour. **Do not change the `toast()` call signature** — `orders-table.tsx` and others call it directly.
- `ui/command.tsx` → the DS `CommandPalette`: the popup contract from Task 7, items on `data-highlighted:bg-sky-100`, the group headings as tracked uppercase `--text-label`, and any ID or SKU in a result in `font-mono`.

- [ ] **Step 7: Extend the barrel**

```ts
export { Callout, type CalloutProps } from "./callout";
export { LoadingState, type LoadingStateProps } from "./loading-state";
```

- [ ] **Step 8: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 9: Check the states against STATES.md**

```bash
npm run dev -w @opcreative/dashboard
```

- [ ] `/profile` — the tab strip (profile / security / api / billing / webhooks) shows the Action Blue underline on the active tab and navigates as before
- [ ] `/orders` while loading — skeleton rows, not a spinner
- [ ] `/orders` filtered to nothing — the empty state names the next action
- [ ] trigger a toast (select orders → Recalculate) — raised white surface, correct status wash, and the message text is unchanged
- [ ] enable "reduce motion" in the OS and reload — no pulse on the skeletons

- [ ] **Step 10: Commit**

```bash
git add apps/dashboard/src/components/ui/tabs.tsx apps/dashboard/src/components/ui/toggle-group.tsx apps/dashboard/src/components/ui/toggle.tsx apps/dashboard/src/components/ui/skeleton.tsx apps/dashboard/src/components/ui/empty.tsx apps/dashboard/src/components/ui/sonner.tsx apps/dashboard/src/components/ui/command.tsx apps/dashboard/src/components/ds
git commit -m "refactor(ds): tab bar, segmented control and the four feedback states

Tabs become the DS TabBar (labels with an Action Blue underline, no pill
track); ToggleGroup becomes the SegmentedControl (a pill track with a filled
active segment) so navigating and filtering never look alike. Adds Callout and
LoadingState, and puts toasts, empty states and the command palette on the
same status washes as StatusBadge. Skeletons honour prefers-reduced-motion.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: DateRangeField and ChartFrame

**Files:**
- Modify: `apps/dashboard/src/components/ui/calendar.tsx`
- Create: `apps/dashboard/src/components/ds/date-range-field.tsx`
- Modify: `apps/dashboard/src/components/ui/chart.tsx`
- Create: `apps/dashboard/src/components/ds/chart-frame.tsx`
- Modify: `apps/dashboard/src/components/ds/index.ts`
- Reference: `docs/design-system/components/forms/DateRangeField.d.ts`, `components/data/ChartFrame.d.ts` + `.prompt.md`, `docs/design-system/BE_ALIGNMENT.md` §3

**Interfaces:**
- Consumes: `Input`/field contract (Task 5), `Popover` (Task 7), `Surface` (Task 8), `date-fns` (already a dependency), `react-day-picker` (already a dependency), `recharts` (already a dependency).
- Produces: `DateRangeField` with `{ from?: Date; to?: Date; onChange: (range: { from?: Date; to?: Date }) => void; label?: React.ReactNode; className?: string }` — chosen to match how the Orders page already passes `from`/`to` through `searchParams`, so adopting it needs no logic change. `ChartFrame` with `{ title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; height?: number; children: React.ReactNode; className?: string }`. Tasks 19 and 20 adopt them.

**A hazard from the DS, to respect rather than paper over:** `BE_ALIGNMENT.md` records that chart series from the backend are **not zero-filled**. A missing day is absent from the array, not present as `0`. Do not add client-side zero-filling in this task — that is a data-layer decision, and inventing it here would put a fabricated zero on a chart. `ChartFrame` renders what it is given; if a Layer 4 task finds a gappy series, it records the gap in `docs/design-system`-style terms and raises it, per `BACKEND_ASKS.md`.

- [ ] **Step 1: Calendar**

In `calendar.tsx`, apply the field/popup contract: the popup surface from Task 7, day cells as `rounded-(--radius-pill)` with `hover:bg-sky-100`, the selected day `bg-primary text-primary-foreground`, the range middle `bg-sky-100 text-navy-700`, today marked with a `ring-1 ring-(--action-200)`, out-of-month days `text-(--text-nontext)`. Weekday headers are tracked uppercase `--fs-micro` `--text-label`. Numerals in the grid take `font-mono` — they are figures.

- [ ] **Step 2: `DateRangeField`**

Create `apps/dashboard/src/components/ds/date-range-field.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The date-range control — ported from the design system's
 * `components/forms/DateRangeField`.
 *
 * The prop shape deliberately mirrors how the pages already carry dates: the
 * Orders page reads `from`/`to` out of searchParams and hands them to a query.
 * Adopting this component therefore needs no change to any handler or query
 * (rules 1, 7).
 *
 * It holds no URL state and no default range: a component that quietly
 * defaults to "last 30 days" makes every page that mounts it lie about what it
 * is showing.
 */
export type DateRangeFieldProps = {
  from?: Date;
  to?: Date;
  onChange: (range: { from?: Date; to?: Date }) => void;
  label?: React.ReactNode;
  className?: string;
};

export function DateRangeField({
  from,
  to,
  onChange,
  label = "Date range",
  className,
}: DateRangeFieldProps) {
  const [open, setOpen] = useState(false);

  const summary =
    from && to
      ? `${format(from, "d MMM yyyy")} – ${format(to, "d MMM yyyy")}`
      : from
        ? `${format(from, "d MMM yyyy")} –`
        : to
          ? `– ${format(to, "d MMM yyyy")}`
          : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            shape="rounded"
            aria-label={typeof label === "string" ? label : "Date range"}
            className={cn("justify-start gap-2 font-normal", className)}
          >
            <CalendarDays className="size-4" />
            {summary ? (
              <span className="font-mono text-(length:--fs-body-sm)">{summary}</span>
            ) : (
              <span className="text-(--text-muted)">{label}</span>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="range"
          selected={{ from, to }}
          onSelect={(range) => onChange({ from: range?.from, to: range?.to })}
          numberOfMonths={2}
        />
        <div className="mt-2 flex justify-end gap-2 border-t border-(--border-hairline) pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({ from: undefined, to: undefined });
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button variant="default" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

`shape="rounded"` is deliberate: this control lives in a dense filter bar next to a `SelectTrigger`, and a pill beside a 10px select reads as a mismatch. Note the `render={…}` composition — Base UI, never `asChild`.

Wire the two `Clear`/`Done` strings through `t()` when adopting the component in Task 20, adding keys to all seven locales; leave them as literals here so this task adds no half-populated locale keys.

- [ ] **Step 3: `ChartFrame`**

Create `apps/dashboard/src/components/ds/chart-frame.tsx`:

```tsx
import { cn } from "@/lib/utils";

import { Surface } from "./surface";

/**
 * The frame every chart sits in — ported from the design system's
 * `components/data/ChartFrame`.
 *
 * The frame owns the title, the surface and the height; the caller owns the
 * chart. Series colours come from --chart-1…5 (mapped to GWP accents in
 * globals.css), never from a literal passed at the call site.
 *
 * NOTE (BE_ALIGNMENT.md): backend chart series are NOT zero-filled — a day
 * with no data is absent from the array rather than present as 0. This frame
 * does not fabricate the missing points, and neither should a caller.
 */
export type ChartFrameProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  height?: number;
  children: React.ReactNode;
  className?: string;
};

export function ChartFrame({
  title,
  subtitle,
  action,
  height = 280,
  children,
  className,
}: ChartFrameProps) {
  return (
    <Surface
      level="data"
      title={title}
      subtitle={subtitle}
      action={action}
      className={cn("overflow-hidden", className)}
    >
      <div style={{ height }} className="w-full">
        {children}
      </div>
    </Surface>
  );
}
```

- [ ] **Step 4: `ui/chart.tsx`**

Give the recharts wrapper the GWP grid and tooltip: grid lines `--border-hairline` and **horizontal only** (the same no-vertical-grid rule as the table), axis ticks `--fs-meta` in `--text-label`, the tooltip on the popup contract from Task 7, and the legend `--fs-body-sm` in `--text-body`. Do not change the component's data plumbing or its `ChartConfig` type.

- [ ] **Step 5: Extend the barrel**

```ts
export { ChartFrame, type ChartFrameProps } from "./chart-frame";
export { DateRangeField, type DateRangeFieldProps } from "./date-range-field";
```

- [ ] **Step 6: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS. Both new components are unmounted until Tasks 19–20, so there is nothing to click yet; the calendar and chart reskins are visible wherever `recharts` already renders (`/` home charts).

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/components/ui/calendar.tsx apps/dashboard/src/components/ui/chart.tsx apps/dashboard/src/components/ds
git commit -m "feat(ds): DateRangeField and ChartFrame; GWP calendar and chart grid

DateRangeField's props mirror the from/to the pages already carry in
searchParams, so adopting it changes no handler or query. ChartFrame owns the
surface, title and height while the caller owns the chart, and series colours
come from --chart-1..5. Charts get horizontal-only grid lines, matching the
table's no-vertical-grid rule. Backend series are not zero-filled and nothing
here fabricates the gaps.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**LAYER 2 REVIEW GATE.** The app now reads 60–70% GWP: soft surfaces, row-rule tables, one popup family, semantic washes, pill controls. Pages are still laid out exactly as before, and still no page file has been edited. Confirm:

```bash
git diff --stat HEAD~7 -- apps/dashboard/src/components/pages
```

Expected: empty.
---

# LAYER 3 — Shell

Four tasks. This is where the Vercel-style sidebar becomes GWP top navigation. **Do the shell once, not per page** — change the shell and all 32 routes inherit it. Layer 3 is the last layer before pages are touched.

---

### Task 15: The `Page` primitives, the Craft Cut and the brand marks

Layer 4's whole job is to make 32 pages compose from `<Page>` / `<PageHeader>` / `<PageToolbar>` / content. Those components must exist, and be opinionated enough that a page *cannot* drift, before any page is opened.

**Files:**
- Create: `apps/dashboard/src/components/ds/page.tsx`
- Create: `apps/dashboard/src/components/ds/craft-cut.tsx`
- Create: `apps/dashboard/src/components/ds/brand/gwp-mark.tsx`
- Create: `apps/dashboard/src/components/ds/brand/wood-rings.tsx`
- Modify: `apps/dashboard/src/components/ds/index.ts`
- Reference: `docs/design-system/components/navigation/PageHero.d.ts` + `.prompt.md`, `components/brand/CraftCut.d.ts`, `GwpMark.d.ts`, `WoodRings.d.ts`, `docs/design-system/tokens/geometry.css`

**Interfaces:**
- Consumes: the token layer (Task 1).
- Produces:
  - `Page` with `{ children: React.ReactNode; className?: string }` — the max-width, gutters and vertical rhythm every route shares.
  - `PageHeader` with `{ title: React.ReactNode; subtitle?: React.ReactNode; meta?: React.ReactNode; tone?: "sky" | "soft" | "cream"; rings?: boolean; cut?: boolean; size?: "sm" | "md" | "lg"; children?: React.ReactNode; className?: string }`.
  - `PageToolbar` with `{ children: React.ReactNode; className?: string }`.
  - `PageSection` with `{ children: React.ReactNode; className?: string }`.
  - `CraftCut` with `{ from?: string; to?: string; depth?: number; sweep?: "right" | "left" | "center"; edge?: "bottom" | "top"; className?: string }`.
  - `GwpMark` with `{ size?: number; tone?: "navy" | "cream" | "sky"; withWordmark?: boolean; className?: string }`; `WoodRings` with `{ size?: number; opacity?: "soft" | "default"; className?: string }`.
  - Every Layer 4 task consumes `Page`, `PageHeader`, `PageToolbar`.

**Two constraints the DS imposes on `PageHeader`, and they are the point of the component:**

1. **The operational hero owns NO CTA, by design.** The DS says so explicitly: operational actions belong in the nav CTA, the search shell's action slot or the toolbar's right side. "A hero with a primary button in the corner is the generic-SaaS page-header pattern, and this component deliberately makes it unavailable." So `PageHeader` **has no `action` prop**, and a Layer 4 task that wants one puts it in `PageToolbar`. This happens to match where our pages already put their actions.
2. **Display ink follows the surface.** On `tone="sky"` the title is **cream**; on `soft` and `cream` it is navy. The eyebrow and subtitle stay navy in every tone, because they are functional text. `tone="deep"` from the DS is **not implemented here**: nothing in the palette clears 4.5:1 on sky-600, it requires automatically nesting the eyebrow and subtitle onto light chips, and no screen in this app needs it. Leaving it out is better than shipping a half-correct version of a rule about contrast.

- [ ] **Step 1: Create `CraftCut`**

Create `apps/dashboard/src/components/ds/craft-cut.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * Craft Cut — the smooth CNC-cut transition between two GWP colour fields,
 * ported from the design system's `components/brand/CraftCut`.
 *
 * DS rule 2: cross the sky/cream boundary at least once per screen with one of
 * these — never a straight rule — and at most TWICE per screen. It is the
 * motif that stops the app reading as stacked rectangles.
 *
 * Depth: 48–72px operational, 96–160px marketing (--craft-cut-depth is 72).
 */
export type CraftCutProps = {
  /** Colour of the section ABOVE the cut. Any GWP colour token. */
  from?: string;
  /** Colour of the section BELOW the cut. */
  to?: string;
  depth?: number;
  sweep?: "right" | "left" | "center";
  /** `bottom` cuts into the section below; `top` mirrors it. */
  edge?: "bottom" | "top";
  className?: string;
};

const SWEEPS = {
  right: "56% 44% 0 0 / 100% 100% 0 0",
  left: "44% 56% 0 0 / 100% 100% 0 0",
  center: "50% 50% 0 0 / 100% 100% 0 0",
} as const;

export function CraftCut({
  from = "var(--surface-canvas)",
  to = "var(--surface-shell)",
  depth = 72,
  sweep = "right",
  edge = "bottom",
  className,
}: CraftCutProps) {
  return (
    <div
      data-slot="craft-cut"
      aria-hidden="true"
      className={cn("w-full overflow-hidden", className)}
      style={{ height: depth, background: from }}
    >
      <div
        className="h-full w-full"
        style={{
          background: to,
          borderRadius: SWEEPS[sweep],
          transform: edge === "top" ? "scaleY(-1)" : undefined,
        }}
      />
    </div>
  );
}
```

The `style` prop carrying `from`/`to` is the one sanctioned use of inline style in this migration: the colours are caller-chosen tokens, and a `border-radius` of `56% 44% 0 0 / 100% 100% 0 0` has no Tailwind utility. Both values are still tokens — the adherence gate's hex check will catch a caller that passes a literal.

- [ ] **Step 2: Create the brand marks**

Create `apps/dashboard/src/components/ds/brand/gwp-mark.tsx`. Port the logo geometry from `docs/design-system/components/brand/GwpMark.jsx`, and use the vendored SVG assets where they are simpler: copy `assets/logo/gwp-monogram.svg` and `assets/logo/gwp-lockup.svg` out of the DS zip into `apps/dashboard/public/gwp/`:

```bash
Z="$HOME/Downloads/GoodWoodPrint Fulfillment Design System1.zip"
mkdir -p apps/dashboard/public/gwp
unzip -q -j -o "$Z" 'assets/logo/gwp-monogram.svg' 'assets/logo/gwp-lockup.svg' 'assets/logo/gwp-favicon.svg' -d apps/dashboard/public/gwp
ls apps/dashboard/public/gwp
```

`GwpMark` then renders the monogram (or the lockup when `withWordmark`) via `next/image` with `priority`, taking `tone` to pick the fill — `navy` on light grounds, `cream` on the sky hero, `sky` on cream. Read the two SVGs first: if they carry hard-coded fills rather than `currentColor`, render them inline as JSX instead of through `next/image` so `tone` can drive the fill, and keep the file to just the paths — no wrapper markup.

Create `apps/dashboard/src/components/ds/brand/wood-rings.tsx` from `WoodRings.jsx`: concentric tree rings drawn with **gradients only** (the DS is explicit — no SVG circles), using `--wood-ring-stroke` (`rgba(15,58,95,0.10)`), `--wood-ring-stroke-soft` and `--wood-ring-gap` (14px). It is decorative: `aria-hidden="true"`, `pointer-events-none`, and it must not affect layout.

Also replace the app icon while here — `apps/dashboard/public/Geomatric/black.svg` and `white.svg` are the old OpCreative monogram referenced by `navbar.tsx`. Leave the files (Task 17 removes the references); do not delete them yet, or the build breaks between tasks.

- [ ] **Step 3: Create the `Page` primitives**

Create `apps/dashboard/src/components/ds/page.tsx`:

```tsx
import { cn } from "@/lib/utils";

import { CraftCut } from "./craft-cut";
import { WoodRings } from "./brand/wood-rings";

/**
 * The page container every route shares — ported in spirit from the design
 * system's operational screens, and the reason this migration does not produce
 * "17 kinds of padding".
 *
 * A route's body is:
 *
 *   <Page>
 *     <PageHeader title={…} />
 *     <PageToolbar>…</PageToolbar>
 *     <DataTable … />
 *   </Page>
 *
 * The gutters (px-6 lg:px-20) and max width (max-w-7xl) are exactly what the
 * existing pages already use, so adopting Page changes no page's measurements —
 * it only stops the next page from choosing differently.
 */
export function Page({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      data-slot="page"
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8 lg:px-20",
        className
      )}
    >
      {children}
    </main>
  );
}

const HERO_TONES = {
  // Saturated sky: the title is CREAM. Display ink follows the surface — a
  // navy headline here is the generic-SaaS look the DS rule exists to prevent.
  sky: {
    surface: "bg-(--surface-canvas)",
    title: "text-(--display-on-sky)",
    meta: "text-(--text-on-sky)",
    subtitle: "text-(--text-on-sky-secondary)",
    cutFrom: "var(--surface-canvas)",
  },
  // Pale sky and cream both carry a NAVY title.
  soft: {
    surface: "bg-(--surface-canvas-soft)",
    title: "text-(--display-on-pale-sky)",
    meta: "text-(--text-label)",
    subtitle: "text-(--text-muted)",
    cutFrom: "var(--surface-canvas-soft)",
  },
  cream: {
    surface: "bg-(--surface-content)",
    title: "text-(--display-on-cream)",
    meta: "text-(--text-label)",
    subtitle: "text-(--text-muted)",
    cutFrom: "var(--surface-content)",
  },
} as const;

const HERO_SIZES = {
  sm: { pad: "px-6 pt-6 pb-8 lg:px-10", title: "text-(length:--fs-display-sm)" },
  md: { pad: "px-6 pt-8 pb-10 lg:px-10", title: "text-(length:--fs-display-md)" },
  lg: { pad: "px-6 pt-10 pb-14 lg:px-10", title: "text-(length:--fs-display-lg)" },
} as const;

/**
 * The operational page header.
 *
 * There is deliberately NO `action` prop. The DS: "The operational hero owns
 * NO CTA by design. Operational actions belong in TopNav.cta,
 * SearchShell.action or TabBar.right. A hero with a primary button in the
 * corner is the generic-SaaS page-header pattern, and this component
 * deliberately makes it unavailable." Put the action in <PageToolbar>.
 *
 * `children` is for secondary content INSIDE the hero — a status summary line,
 * a date range. Not actions.
 */
export function PageHeader({
  title,
  subtitle,
  meta,
  tone = "sky",
  rings = false,
  cut = true,
  size = "md",
  children,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Small uppercase eyebrow — module name or breadcrumb. */
  meta?: React.ReactNode;
  tone?: keyof typeof HERO_TONES;
  rings?: boolean;
  /** Render the Craft Cut into the surface below. */
  cut?: boolean;
  size?: keyof typeof HERO_SIZES;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = HERO_TONES[tone];
  const s = HERO_SIZES[size];

  return (
    <header
      data-slot="page-header"
      data-tone={tone}
      className={cn(
        "relative -mx-6 overflow-hidden rounded-(--radius-hero) lg:-mx-10",
        t.surface,
        className
      )}
    >
      {rings && <WoodRings className="absolute -top-8 -right-8" size={280} />}

      <div className={cn("relative", s.pad)}>
        {meta && (
          <p
            className={cn(
              "font-sans text-(length:--fs-micro) font-bold tracking-(--ls-caps) uppercase",
              t.meta
            )}
          >
            {meta}
          </p>
        )}
        <h1
          className={cn(
            "font-display leading-(--lh-display) font-(--fw-display) tracking-(--ls-display)",
            s.title,
            t.title
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p className={cn("mt-2 max-w-2xl font-sans text-(length:--fs-body-lg)", t.subtitle)}>
            {subtitle}
          </p>
        )}
        {children && <div className="mt-6">{children}</div>}
      </div>

      {cut && <CraftCut from={t.cutFrom} to="var(--surface-shell)" depth={56} sweep="right" />}
    </header>
  );
}

/**
 * The row of filters and actions under the header. This is where a page's
 * primary action lives — one Action Blue button, on the right.
 *
 * A page whose list already renders <DataTableToolbar> inside its DataTable
 * does NOT need this: that toolbar is the same surface and the same slot.
 * Use PageToolbar for pages with no table.
 */
export function PageToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-toolbar"
      className={cn(
        "flex flex-col gap-3 rounded-(--radius-card) bg-(--surface-shell) p-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      {children}
    </div>
  );
}

/** A vertical group inside a page. Exists so sections never invent their own gap. */
export function PageSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section data-slot="page-section" className={cn("flex flex-col gap-4", className)}>
      {children}
    </section>
  );
}
```

- [ ] **Step 4: Extend the barrel**

```ts
export { CraftCut, type CraftCutProps } from "./craft-cut";
export { GwpMark } from "./brand/gwp-mark";
export { Page, PageHeader, PageSection, PageToolbar } from "./page";
export { WoodRings } from "./brand/wood-rings";
```

- [ ] **Step 5: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

If the gate flags the `rgba(...)` inside `wood-rings.tsx`, that is a true positive worth fixing properly: move the gradient stops to `var(--wood-ring-stroke)` / `var(--wood-ring-stroke-soft)` rather than adding an exception to the script.

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/ds apps/dashboard/public/gwp
git commit -m "feat(ds): Page primitives, Craft Cut and the brand marks

Page/PageHeader/PageToolbar/PageSection are the composition contract Layer 4
builds on — the gutters and max width match what the pages already use, so
adopting them changes no measurements, only stops the next page choosing
differently. PageHeader has no action prop: the DS makes the generic-SaaS
hero-CTA pattern unavailable on purpose, and actions belong in the toolbar.
Display ink follows the surface (cream title on saturated sky, navy on pale).
tone='deep' is deliberately not implemented — nothing clears 4.5:1 on sky-600.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: The root layout — sky page, floating shell, no persistent rail

**Files:**
- Modify: `apps/dashboard/src/app/layout.tsx`
- Modify: `apps/dashboard/src/app/globals.css` (`@layer base` block, lines ~340-378)
- Reference: `docs/design-system/components/navigation/TopNav.d.ts`, `docs/design-system/RESPONSIVE.md`

**Interfaces:**
- Consumes: fonts (Task 1), `Navbar` (reskinned in Task 17 — this task keeps rendering the current one), `Footer`, `AppProviders`, `AppSidebar`/`SidebarProvider`.
- Produces: a root layout whose `<body>` is the sky canvas and whose content column has no persistent left rail. `Navbar` and `AppSidebar` keep their exports and their props; Task 17 reskins their internals.

The DS is unambiguous: *"GWP never uses a dark or vertical sidebar, and never a full-bleed generic SaaS header."* The current layout wraps everything in `SidebarProvider` + a 240px `AppSidebar` + `SidebarInset`. That rail goes. **The sidebar's content does not** — `SidebarNavButtons` already opens it as a sheet on mobile, and that becomes its only mode.

- [ ] **Step 1: Rewrite the layout body**

Replace the `return` of `RootLayout` in `apps/dashboard/src/app/layout.tsx`. Keep the `auth()` call, the `user` object construction and `AppProviders` **exactly** as they are — that is session logic (rules 1, 3).

```tsx
  return (
    // suppressHydrationWarning: next-themes stamps the theme class on <html>
    // before hydration. The theme is a no-op after the token migration (the DS
    // ships no dark palette) but the provider stays wired.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      {/* SKY IS THE PAGE. The body is the sky canvas and content floats on it —
          not a white app with a sky accent. pb: clearance for the floating
          mobile dock. */}
      <body className="flex min-h-full flex-col bg-(--surface-canvas) pb-24 md:pb-0">
        <AppProviders user={user} accountLocale={session?.user?.locale}>
          {/* No SidebarProvider and no persistent rail: GWP navigation is the
              floating cream TopNav, and the section rail opens as a sheet from
              the nav's own button (SidebarNavButtons). */}
          <Navbar />
          {children}
          {/* Marketing footer is for the signed-out surface only */}
          {!user && <Footer />}
        </AppProviders>
      </body>
    </html>
  );
```

Drop these imports, now unused: `SidebarProvider`, `SidebarInset`, `AppSidebar`. Also delete the `<script>` that restored `sidebar:width` from `localStorage` — there is no draggable rail left to size, and the inline script was only there to beat the rail's first paint.

- [ ] **Step 2: Move the sidebar into a sheet**

`AppSidebar` is 501 lines and holds the full navigation tree, the search box, the team switcher and the theme toggle. It must keep working — as a sheet.

Read `apps/dashboard/src/components/global/layout/sidebar/app-sidebar.tsx` and check how `SidebarNavButtons` currently opens it. If it depends on `SidebarProvider` context (`useSidebar`), the provider must move **inside** `Navbar` rather than being deleted: wrap only the nav's own subtree in `SidebarProvider`, so the sheet still has its context while the layout has no rail. That is a smaller change than rewriting 501 lines, and it keeps every nav item, permission filter and link intact (rules 1, 5).

Verify which case you are in before editing:

```bash
grep -n "useSidebar\|SidebarProvider\|SidebarTrigger\|Sheet" apps/dashboard/src/components/global/layout/sidebar/app-sidebar.tsx | head -20
```

- [ ] **Step 3: Set the base layer's ground and selection**

In `globals.css`'s `@layer base` block, the `body` rule should now read (keep whatever font-feature and antialiasing rules are already there, and drop any `font-feature-settings` referencing Geist's `ss01`–`ss12` stylistic sets — Nunito Sans does not have them):

```css
  body {
    @apply font-sans;
    background: var(--surface-canvas);
    color: var(--text-body);
  }

  ::selection {
    background: var(--selection-bg);
    color: var(--selection-fg);
  }
```

Also check the block for a `--grid-bg` / `grid-bg` utility and the `text-gradient` / `btn-shine` effects from the Vercel era (they live in the `@layer utilities` block at line ~379). Any of them that references a Vercel gradient token must go — the DS sanctions exactly two gradients (`--field-admin` for the admin dissolve and `--field-hero-sky` for one hero surface), and a brand mesh is not among them. Remove the utility and the rules that use it:

```bash
grep -rn "text-gradient\|btn-shine\|grid-bg\|brand-mesh\|brand-gradient\|gradient-develop\|gradient-preview\|gradient-ship" --include='*.tsx' --include='*.css' apps/dashboard/src
```

Delete each utility definition and each call site's class.

**Task 1 left these tokens alive on purpose — you are the task that removes
them.** Deleting `--brand-gradient` in Task 1 would have made the login
headline transparent, because `.text-gradient` paints with
`background-clip: text; color: transparent`. So Task 1 re-composed
`--gradient-develop/-preview/-ship`, `--brand-gradient` and `--brand-mesh` out
of GWP tokens (action/sky/orange/yellow/red — no new colours) as a bridge.
Every consumer is an auth or marketing surface: `login-screen.tsx` (5 sites),
`reset-password.tsx` (2), `[...comingSoon]/page.tsx` (1). Delete the token
definitions from `globals.css` in this task **together with** the utilities and
those call sites. Task 26 then rebuilds the login screen as the app's second
brand moment, so it does not need a gradient to look composed.

Note also that `vercel-purple` and `vercel-pink` had no GWP counterpart — GWP
ships no purple or pink ramp — so Task 1 substituted `sky-500` and
`orange-500` inside those gradients. That substitution disappears with the
gradients themselves; do not preserve it. If a call site's element becomes unstyled, give it `text-(--text-strong)` — a plain navy heading is correct GWP; a rainbow gradient is not.

- [ ] **Step 4: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 5: Walk the shell on desktop and phone**

```bash
npm run dev -w @opcreative/dashboard
```

- [ ] Signed in at 1440px: no left rail; the page ground is sky; content floats on it
- [ ] The nav button still opens the full navigation as a sheet, and every link in it still navigates
- [ ] Permission-gated nav items still appear/disappear for the right roles (sign in as a seller and as an admin if seeded accounts allow; otherwise read `app-sidebar.tsx`'s filters and confirm they are unchanged in the diff)
- [ ] At 390px: the floating mobile dock still clears the bottom (that is the `pb-24`), and its four tabs still route
- [ ] Signed out at `/`: the login screen renders and the marketing footer is present
- [ ] `docs/design-system/RESPONSIVE.md` — check the 1024px floor note: `TopNav` has no collapse behaviour designed below it, so between 768px and 1024px the sheet is the navigation. Confirm that is what happens rather than a broken half-nav.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/app/layout.tsx apps/dashboard/src/app/globals.css apps/dashboard/src/components/global/layout
git commit -m "refactor(ds): sky page ground, no persistent sidebar rail

The DS: GWP never uses a vertical sidebar and never a full-bleed SaaS header.
The 240px rail and its localStorage width-restore script go; the sidebar's
full navigation tree survives unchanged as the sheet it already opened as on
mobile. Body becomes the sky canvas so content floats on it. Removes the
Vercel-era gradient utilities (text-gradient, btn-shine, grid-bg, brand-mesh)
— the DS sanctions exactly two gradients and none of them is a brand mesh.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
---

### Task 17: TopNav — the floating cream shell

**Files:**
- Modify: `apps/dashboard/src/components/global/layout/navbar/navbar/navbar.tsx`
- Modify: `apps/dashboard/src/components/global/layout/navbar/navbar/nav-tabs.tsx`
- Modify: `apps/dashboard/src/components/global/layout/navbar/menus/user-menu.tsx`, `mobile-user-menu.tsx`, `language-selector.tsx`, `tools-dropdown.tsx`
- Modify: `apps/dashboard/src/components/global/layout/navbar/notifications/notification-bell.tsx`, `notification-render.tsx`
- Modify: `apps/dashboard/src/components/global/layout/sidebar/app-sidebar.tsx` (class strings + theme-toggle removal)
- Modify: `apps/dashboard/src/components/global/layout/footer/footer.tsx`, `footer-social.tsx`
- Reference: `docs/design-system/components/navigation/TopNav.d.ts` (incl. `NavUserProps`), `AdminBar.d.ts`, `TabBar.d.ts`

**Interfaces:**
- Consumes: `GwpMark` (Task 15), `Button` (Task 3), `SearchField` (Task 11), the popup contract (Task 7).
- Produces: `Navbar`, `NavTabs`, `SidebarNavButtons`, `AppSidebar`, `UserMenu`, `MobileUserMenu`, `LanguageSelector`, `ToolsDropdown`, `NotificationBell`, `Footer` — every export and prop unchanged. **`useDockTabs`, `activeHref`, `sectionFor`, `activeTabHref`, `usePermissions` and `NAV_SECTIONS` are untouched** — they are nav *logic* and permission filtering (rules 1, 2, 5).

The DS's nav rules, all of which are checkable:

- A **warm cream surface floating on the sky canvas**, with sky visible around a rounded shell and one quiet shadow.
- Passive items **navy**; the active item a **pale sky pill**; **Action Blue appears only in the CTA** — nowhere else in the nav.
- 6–8 top-level items maximum.
- `variant="floating"` + `surface="cream"` is canonical for the seller app; `variant="bar"` + `surface="white"` is the admin bar (Task 18).

- [ ] **Step 1: Make the nav a floating cream shell**

In `navbar.tsx`, replace the `<nav>` element's className. The current value is a full-bleed sticky bar with a translucent background and a backdrop blur — three things the DS rules out.

```tsx
      <nav
        data-slot="top-nav"
        className="sticky top-0 z-50 w-full px-4 pt-3 lg:px-8"
        style={{ overflowAnchor: "none" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 rounded-(--radius-pill) bg-(--surface-nav) px-4 shadow-(--shadow-sm) lg:px-6">
```

…and close the extra `</div>` before `</nav>`. Keep `style={{ overflowAnchor: "none" }}` — it stops the sticky nav from being chosen as the browser's scroll anchor, which is a real fix, not styling.

The outer `px-4 pt-3` is what lets sky show *around* the shell. Without it the nav is a full-bleed cream bar, which is the DS's explicitly non-canonical fallback.

- [ ] **Step 2: Swap the brand mark**

Replace the `next/image` block pointing at `/Geomatric/black.svg` and `/Geomatric/white.svg` with `<GwpMark size={26} tone="navy" />` for the signed-out lockup, and delete the `OpCreative` text node next to it if `GwpMark withWordmark` carries the wordmark. Then delete the now-unreferenced files:

```bash
grep -rn "Geomatric" --include='*.tsx' apps/dashboard/src || rm -rf apps/dashboard/public/Geomatric
```

Also drop the `dark:hidden` / `hidden dark:block` image pair — there is one mark now, on one theme.

- [ ] **Step 3: Nav item ink and the active pill**

The signed-out nav links currently use an animated underline (`after:w-0 hover:after:w-full`) in `text-muted-foreground`/`text-foreground`. Replace each link's className with the DS's item treatment:

```
"inline-flex h-9 items-center rounded-(--radius-pill) px-3 font-sans text-(length:--fs-body) font-semibold text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none aria-[current=page]:bg-sky-200 aria-[current=page]:text-navy-700"
```

The signed-out "Login" and "Signup" links become real `Button`s so the nav has exactly one Action Blue element: `<Button variant="ghost" size="sm" render={<Link href="/" />} nativeButton={false}>` for login and `<Button variant="default" size="sm" render={<Link href="/?signup=1" />} nativeButton={false}>` for signup. The `nativeButton={false}` is required when rendering a non-button on `Button` in this Base UI build — omitting it is the documented trap.

- [ ] **Step 4: `NavTabs` becomes the DS `TabBar`**

`nav-tabs.tsx` keeps every line above the `return` — `sectionFor`, the permission filter, `activeTabHref` (rules 1, 5). Only the two class strings change. The tabs now sit inside the cream shell, so the underline treatment from Task 13 is right, but the ink is the nav's:

```tsx
            className={`relative inline-flex shrink-0 items-center rounded-(--radius-pill) px-3 font-sans text-(length:--fs-body-sm) font-semibold transition-colors duration-(--dur-fast) ease-(--ease-out) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none ${
              isActive
                ? "bg-sky-200 text-navy-700"
                : "text-navy-500 hover:bg-sky-100 hover:text-navy-700"
            }`}
```

…and **delete** the `{isActive && <span className="bg-foreground absolute inset-x-3 -bottom-px h-[2px] …" />}` underline element entirely. Inside a floating pill-shaped shell there is no bottom border for an underline to land on; the DS's own treatment here is the pale sky pill. Removing it also lets the wrapper drop `h-full items-stretch`, which existed only so the underline could reach the border:

```tsx
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
```

- [ ] **Step 5: The mobile dock**

The floating pill dock is already the right shape. Its surface becomes cream and its states sky:

```tsx
        <div className="flex items-center gap-1 rounded-(--radius-pill) bg-(--surface-nav) p-1.5 shadow-(--shadow-md)">
```

and each tab:

```tsx
            className={`inline-flex size-10 items-center justify-center rounded-(--radius-pill) transition-colors duration-(--dur-fast) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none ${
              activeTab === href
                ? "bg-sky-200 text-navy-700"
                : "text-navy-500 hover:bg-sky-100 hover:text-navy-700"
            }`}
```

Drop the `border-border` + `bg-background/80` + `backdrop-blur` combination. Keep `useDockTabs` and its four-item ceiling exactly as written — that reasoning is documented in the file and is a product decision, not styling.

- [ ] **Step 6: Remove the theme toggle from the shell**

The DS ships no dark palette, and Task 1 made `.dark` a no-op, so a visible toggle now promises something that does not happen. Remove `<ThemeToggle />` from `navbar.tsx` and from `app-sidebar.tsx`'s footer. **Do not delete** `theme-toggle.tsx`, `animated-theme-toggler.tsx`, `theme-provider.tsx` or the `next-themes` dependency — they stay wired and unused, so a future GWP dark palette is a one-block change.

```bash
grep -rn "ThemeToggle\|AnimatedThemeToggler" --include='*.tsx' apps/dashboard/src
```

Expected after the edit: hits only in `components/global/theme/*` and `components/ui/animated-theme-toggler.tsx` — no call sites in the shell.

- [ ] **Step 7: The user menu, the bell, the language selector and the sidebar sheet**

Class strings only, using the contracts already established:

- `user-menu.tsx` / `mobile-user-menu.tsx` — the trigger is an avatar in a `rounded-(--radius-pill)` hit area with `hover:bg-sky-100`; the popup uses Task 7's contract. Per `NavUserProps`, the role label under the name must be one of the seven real roles (`admin`, `customer`, `warehouse`, `warehouse_external`, `warehouse_admin`, `supporter`, `designer`) — read it from the session as the file already does, and **do not invent a display name for a role**.
- `notification-bell.tsx` — the unread dot becomes `bg-(--status-attention-dot)`; the count chip `bg-(--status-critical-bg) text-(--status-critical-fg) font-mono text-(length:--fs-micro)`. Do not touch `notification-data.ts`.
- `language-selector.tsx`, `tools-dropdown.tsx` — Task 7's popup contract; leave the seven-locale list and its logic alone.
- `app-sidebar.tsx` — the sheet panel is `bg-(--surface-nav)` (cream) with `shadow-(--shadow-drawer)`; nav items take the item treatment from Step 3; group labels become tracked uppercase `--fs-micro` `--text-label`. **Every permission filter, every href and the team switcher's logic stay exactly as they are.** This file is 501 lines; the diff should be class strings and the removed `<ThemeToggle />`, nothing else.
- `footer.tsx`, `footer-social.tsx` — signed-out surface. Cream ground (`bg-(--surface-content)`), navy ink, `--fs-body-sm`, and a `CraftCut` above it (`from="var(--surface-canvas)" to="var(--surface-content)"`) so the marketing footer crosses the boundary the DS asks for.

- [ ] **Step 8: Count the top-level nav items**

The DS caps the primary set at 6–8. Check what the shell now shows for each role:

```bash
grep -c "href:" apps/dashboard/src/config/nav-tabs.ts
```

That counts *section tabs*, which are per-section and therefore fine. What matters is the top-level set in the cream shell. Read `navbar.tsx` and `app-sidebar.tsx`'s top group and count what a signed-in seller sees. **If it exceeds 8, do not silently trim it** — that would remove navigation, which is a rule-10 violation. Record the count in the commit message and raise it as a follow-up for a product decision.

- [ ] **Step 9: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 10: Walk the whole shell**

```bash
npm run dev -w @opcreative/dashboard
```

- [ ] the nav is a **cream pill floating on sky**, with sky visible on all sides of it
- [ ] there is **exactly one Action Blue element** in the nav (count it — the DS allows only the CTA)
- [ ] the active section tab is a pale sky pill, not an underline
- [ ] the nav sheet opens, every link navigates, and permission-gated items still match the role
- [ ] the notification bell opens, and its unread state is the attention dot
- [ ] the language selector still switches locale and the page still re-renders in it
- [ ] the user menu opens and sign-out still works
- [ ] no theme toggle is visible anywhere
- [ ] at 390px the cream dock floats above the content and routes
- [ ] signed out: the login screen and the cream footer with a Craft Cut above it

- [ ] **Step 11: Commit**

```bash
git add apps/dashboard/src/components/global/layout apps/dashboard/public
git commit -m "refactor(ds): the floating cream TopNav

The nav becomes a rounded cream shell floating on the sky canvas with one quiet
shadow — no full-bleed bar, no translucency, no backdrop blur (all three ruled
out by the DS). Passive items navy, active item a pale sky pill, and exactly
one Action Blue element in the whole nav. Section tabs lose their underline:
inside a pill shell there is no border for one to land on, so they take the
DS's sky pill instead. Brand mark swaps to GwpMark. Theme toggle leaves the
shell (dark is a no-op; the components stay wired for a future DS palette).

Every nav item, href, permission filter and useDockTabs ceiling is unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 18: Admin and warehouse chrome

The DS splits the apps: `seller` is the cream shell floating on sky; `admin` is a **white ground** with `TopNav variant="bar" surface="white"`; and the warehouse workstations (scan/QC) use `AdminBar` chrome. Our single app carries all three audiences, so the chrome has to switch by route rather than by build.

**Files:**
- Modify: `apps/dashboard/src/components/global/layout/navbar/navbar/navbar.tsx` (surface switch)
- Modify: `apps/dashboard/src/app/(protected)/layout.tsx` — **JSX wrapper only**
- Modify: `apps/dashboard/src/components/pages/fulfillment/station.tsx`, `station-actions.tsx`, `scan-input.tsx`, `quick-scan.tsx`, `camera-panel.tsx`, `group-summary.tsx`, `order-card-grid.tsx`
- Reference: `docs/design-system/components/navigation/AdminBar.d.ts` + `.prompt.md`, `docs/design-system/tokens/surfaces.css` (`--field-admin`), `docs/design-system/ui_kits/screen-manifest.json`

**Interfaces:**
- Consumes: `Navbar` (Task 17), `Surface` (Task 8), `Button` (Task 3), `StatusBadge` (Task 4).
- Produces: `Navbar` gains an internal surface switch derived from `usePathname()` — **no new prop**, so no caller changes. `(protected)/layout.tsx` keeps its `auth()` guard and its redirect untouched.

- [ ] **Step 1: Derive the chrome surface from the route**

In `navbar.tsx`, above the `return`, add the switch. It reads `pathname`, which the component already has:

```tsx
  // The DS ships two chromes: the seller's cream shell floating on sky, and
  // the admin bar — white ground, full-bleed, one bright CTA. Admin screens
  // are dense tables where a floating shell wastes a row of vertical space, so
  // they take the bar. Derived from the route rather than added as a prop, so
  // no caller changes and no page can get it wrong.
  const isAdminChrome =
    pathname.startsWith("/admin") || pathname.startsWith("/fulfillment");
```

Then make the shell's two classNames conditional — the outer wrapper loses its sky gutter and the inner shell goes white and square-cornered under admin chrome:

```tsx
      <nav
        data-slot="top-nav"
        data-surface={isAdminChrome ? "white" : "cream"}
        className={
          isAdminChrome
            ? "sticky top-0 z-50 w-full border-b border-(--border-hairline) bg-(--surface-data)"
            : "sticky top-0 z-50 w-full px-4 pt-3 lg:px-8"
        }
        style={{ overflowAnchor: "none" }}
      >
        <div
          className={
            isAdminChrome
              ? "mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-6 lg:px-20"
              : "mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 rounded-(--radius-pill) bg-(--surface-nav) px-4 shadow-(--shadow-sm) lg:px-6"
          }
        >
```

Everything inside that container — brand, tabs, bell, language, user — is identical in both chromes. Do not fork the children.

- [ ] **Step 2: Give admin pages the sanctioned dissolve field**

The DS sanctions exactly one gradient for the admin shell: `--field-admin`, a vertical sky→white dissolve, **one per screen, admin surfaces only, vertical top→bottom, never diagonal or radial**. Its stops are absolute px so it reads the same on an 800px screen and a 4000px scroll.

Apply it in `(protected)/layout.tsx`, wrapping `children` only. The `auth()` call and the `redirect("/")` must not move:

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@opcreative/auth";

/**
 * Every page in this group requires a session; signed-out visitors land on
 * "/" (the login screen). DB-session check runs server-side per request —
 * no proxy.ts needed (proxy can't share the Prisma client anyway).
 *
 * The wrapper adds the DS's one sanctioned admin gradient: a vertical sky→white
 * dissolve (--field-admin) that turns a flat sky field plus white cards back
 * into one continuous surface. Admin/warehouse routes only — seller screens
 * stay flat sky, per surfaces.css.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const pathname = (await headers()).get("x-pathname") ?? "";
  const adminField =
    pathname.startsWith("/admin") || pathname.startsWith("/fulfillment");

  return (
    <div
      data-slot="protected-field"
      className="flex flex-1 flex-col"
      style={adminField ? { background: "var(--field-admin)" } : undefined}
    >
      {children}
    </div>
  );
}
```

`x-pathname` is not a header Next.js sets by itself. Check whether the app already provides it:

```bash
grep -rn "x-pathname\|x-invoke-path" apps/dashboard --include='*.ts' --include='*.tsx' --include='*.mjs'
```

If it does not, **do not add middleware for this** — a middleware file changes the request path for every route and is far more risk than a gradient is worth. Instead move the field onto the client side: read `usePathname()` in a small `"use client"` wrapper component under `components/global/layout/`, and render `{children}` inside it. Take that route if the grep comes back empty.

- [ ] **Step 3: The warehouse workstations**

`/fulfillment`, `/fulfillment/quick` and `/fulfillment/monitor` are scan/QC stations — used standing up, at arm's length, often on a shared terminal. `AdminBar.prompt.md` and `docs/design-system/ui_kits/warehouse-app/` are the reference. Class strings and layout only; **`use-proof-upload.tsx`, every scan handler, `confirm-scan-dialog`, `already-scanned-dialog`, `handoff-dialog` and `link-label-dialog` logic must not change** (rules 1, 7).

- `station.tsx`, `quick-scan.tsx` — wrap the workstation in `<Surface level="data">`; the scan target sits on `--surface-inset`; the primary scan action is the one Action Blue button, at `size="lg"` (48px) because it is hit with a glove or a scanner trigger.
- `scan-input.tsx` — the field is `size="lg"`, `font-mono` (it receives barcodes and order IDs), and keeps its autofocus and its keyboard handling exactly as they are.
- `station-actions.tsx` — actions are `size="lg"`; destructive ones use `variant="destructive"` (white pill, red ink) so a mis-hit at speed is not a filled red target next to a filled blue one.
- `group-summary.tsx`, `order-card-grid.tsx` — cards become `<Surface level="data">`; order IDs and SKUs `font-mono`; every status is a `<StatusBadge>` (Task 4) rather than coloured text or a hand-picked badge variant.
- `camera-panel.tsx` — the viewport keeps its aspect ratio and its stream logic; only the frame becomes `rounded-(--radius-card) border border-(--border-soft)`.

**Do not invent QC state.** `docs/design-system/BACKEND_GAPS.md` records that QC has no state in the backend and that scan mutates on GET. Render what the existing code renders; if a state looks missing, it is a documented gap, not something to fill in.

- [ ] **Step 4: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS. The `style={{ background: "var(--field-admin)" }}` will not trip the hex check — it is a token reference.

- [ ] **Step 5: Check both chromes and the scan flow**

```bash
npm run dev -w @opcreative/dashboard
```

- [ ] `/orders` (seller chrome): cream pill nav floating on flat sky
- [ ] `/admin/users` (admin chrome): white full-bleed bar, and the page ground dissolves sky→white from the top
- [ ] the dissolve appears **once** per screen and is vertical
- [ ] `/fulfillment`: 48px scan field and 48px actions; the field is monospaced and autofocused
- [ ] scan a known order (or paste an ID and press Enter): the same handler fires, the same dialogs open, the same toast appears
- [ ] scan an already-scanned order: `already-scanned-dialog` still intercepts
- [ ] every status on the station is a `StatusBadge`, and no status is rendered as coloured text

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/global/layout/navbar apps/dashboard/src/app/\(protected\)/layout.tsx apps/dashboard/src/components/pages/fulfillment
git commit -m "feat(ds): admin bar chrome and the warehouse workstations

The DS ships two chromes; this app carries both audiences, so the shell now
switches on the route rather than the build: seller routes keep the floating
cream shell, /admin and /fulfillment take the white full-bleed bar plus the one
sanctioned admin gradient (--field-admin, the vertical sky->white dissolve).
Workstations get 48px scan targets and monospaced scan fields for standing use.
No scan handler, upload hook or dialog logic changed, and no QC state was
invented — BACKEND_GAPS.md records that it has none.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**LAYER 3 REVIEW GATE.** The app now reads as GoodWoodPrint end to end: sky page, floating cream nav (or the white admin bar), soft surfaces, row-rule tables, semantic status washes, GWP type. Every route inherited it from the shell. Confirm that pages are still untouched apart from the fulfillment workstations:

```bash
git diff --stat HEAD~11 -- apps/dashboard/src/components/pages
```

Expected: only `components/pages/fulfillment/*`.
---

# LAYER 4 — Page composition

Nine tasks. Pages change here for the first time, and **only** their spacing, grouping, hierarchy, toolbar and card placement. No component is rewritten, no handler is touched, no query moves.

**The interaction-inventory protocol.** Every task in this layer opens with the same procedure, because rule 10 — *a migrated page must preserve every previous interaction* — is only checkable against a list built from the code, not from memory:

```bash
cd apps/dashboard/src/components/pages/<group>
# 1. every handler the group binds
grep -rhoE 'on[A-Z][a-zA-Z]*=' . --include='*.tsx' | sort | uniq -c | sort -rn
# 2. every permission gate
grep -rn 'can("\|<Can \|hasRole(' . --include='*.tsx'
# 3. every dialog / drawer the group can open
ls *dialog*.tsx *sheet*.tsx 2>/dev/null
# 4. every server action it calls
grep -rn 'from "@/modules' . --include='*.tsx'
```

Write the result into the task's checklist **before editing**, then walk it after. A migrated page with one fewer interaction is not migrated. The counts below each task are what this repo showed on 2026-09-03 — treat a materially different number as a sign the file has changed since, and re-derive rather than trusting the plan.

**The page recipe** (the same for all nine tasks — this is the anti-drift contract from the spec):

```tsx
import { Page, PageHeader } from "@/components/ds";

export default async function SomePage({ searchParams }: { … }) {
  //  ↓ EVERYTHING in the data-fetching body is untouched: the awaits, the
  //    searchParams parsing, requireUser(), can(), the props construction.
  const sp = await searchParams;
  const actor = await requireUser();
  const { rows, total } = await listSomething({ … });

  return (
    <Page>
      <PageHeader meta="Module" title="Page title" subtitle="One line." />
      <SomeClientTable rows={rows} total={total} />
    </Page>
  );
}
```

The `<main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">` that pages currently open with becomes `<Page>` — **identical measurements**, so nothing shifts; it just stops the next page choosing differently.

Three token rules that recur in every task and are checkable per page:

1. **Every status is a `<StatusBadge>`.** Never coloured text, never a hand-picked `Badge` variant, never a colour from the backend.
2. **Order IDs, SKUs, tracking numbers and money are `font-mono`.** Nothing else is.
3. **One Action Blue per region.** The page's primary action lives in the toolbar's right side, never in `PageHeader` (which has no `action` prop for exactly this reason).

---

### Task 19: Home — the three role dashboards

**Files:**
- Modify: `apps/dashboard/src/app/page.tsx` (JSX wrapper only)
- Modify: `apps/dashboard/src/components/pages/home/home.tsx`, `home-header.tsx`, `seller-home.tsx`, `admin-home.tsx`, `warehouse-home.tsx`, `period-control.tsx`
- Reference: `docs/design-system/ui_kits/seller-app/README.md` (Dashboard section), `docs/design-system/screenshots/reference/`, `docs/design-system/BE_ALIGNMENT.md` §3 (dashboard overview/efficiency endpoints)

**Interfaces:**
- Consumes: `Page`, `PageHeader`, `PageSection` (Task 15), `MetricCard` (Task 9), `ChartFrame` (Task 14), `Surface`/`SectionHeading` (Task 8), `StatusBadge` (Task 4).
- Produces: no exported signature changes. `home.tsx` still chooses between the three role dashboards; each still receives the same props.

- [ ] **Step 1: Build the inventory**

Run the four greps above with `<group>` = `home`. Expected (2026-09-03): 6 files, ~4 handlers, 0 dialogs, 0 permission gates, 1 `DataTable`. The small handler count is because the role split happens server-side. Record:

- [ ] period control changes the window and the figures re-query
- [ ] the role split still routes seller / admin / warehouse to their own dashboard
- [ ] the recent-orders table still links through to `/orders`
- [ ] every chart still renders its series

- [ ] **Step 2: Adopt `Page` + `PageHeader` in `app/page.tsx`**

`app/page.tsx` renders the login screen when signed out and the dashboard home when signed in. **Do not touch that branch** — it is auth logic. Wrap only the signed-in branch in `<Page>`, and give it the hero:

```tsx
    <Page>
      <PageHeader
        meta={t("nav.home")}
        title={t("home.greeting", { name: user.displayName ?? "" })}
        subtitle={t("home.subtitle")}
        tone="sky"
        rings
      />
      <Home … />
    </Page>
```

`tone="sky"` means the title renders **cream** — this is the one screen in the app that is a brand moment, and the DS's rule 3 is that display ink follows the surface. If `home.greeting` / `home.subtitle` do not exist as keys, add them to **all seven** locale files in `src/lib/i18n`; do not inline English.

The `rings` prop puts the `WoodRings` motif behind the hero. That plus the header's own Craft Cut is **two** brand marks on this screen, which is the DS's per-screen maximum — so no other section on the home page may add a cut.

- [ ] **Step 3: KPI tiles become `MetricCard`**

The three role dashboards each hand-roll their KPI row. Replace each tile with `<MetricCard>`, matching the tone to the metric's **meaning** rather than picking for variety (the DS is explicit about this):

- an in-flight count (in production, processing) → `tone="progress"`
- a completed count (fulfilled, delivered) → `tone="success"`
- a failure or delay count → `tone="critical"`
- a needs-intervention count (on hold, design problems) → `tone="attention"`
- the headline figure (revenue, orders today) → `tone="action"`
- a plain total → `tone="neutral"`

Leave `variant` at its default `wash`. The DS calls the white-card-with-icon-chip variant generic SaaS, and permits it for at most one introductory row — if a dashboard genuinely reads better with one, use `variant="card"` on that row only and nowhere else.

The **value** each tile receives must be the same value the same expression produced before. Do not reformat a number, change a rounding, or move a `toFixed` — money formatting is business logic (`baseCost: o.baseCost?.toFixed(2)` in the orders page is the pattern). Money in a tile takes `font-mono` via `MetricCard`'s own value styling only if the tile is a currency figure; pass it already-formatted, as now.

- [ ] **Step 4: Charts get `ChartFrame`**

Wrap each `recharts` chart in `<ChartFrame title={…} height={…}>`, deleting the hand-rolled card wrapper around it. Series colours must come from `--chart-1`…`--chart-5` (mapped to GWP accents in Task 1) — if a chart passes a literal colour, replace it with the token; the adherence gate will catch any that are missed.

**The zero-fill hazard.** `BE_ALIGNMENT.md` records that backend chart series are not zero-filled: a day with no data is absent from the array, not present as `0`. If a chart looks wrong because of that, **do not add client-side zero-filling here** — it is a data-layer decision and inventing it puts a fabricated zero on a chart. Note the affected chart in the commit message and raise it as a backend ask.

- [ ] **Step 5: Sections get `SectionHeading`**

Each block below the KPI row ("Recent orders", "Production status") takes `<SectionHeading title={t(…)} action={…}>` inside a `<PageSection>`. The `action` slot is where a "View all" link goes — as `variant="link"`, not a second Action Blue button.

- [ ] **Step 6: Verify lint, build, adherence**

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all three PASS.

- [ ] **Step 7: Walk the inventory from Step 1**

```bash
npm run dev -w @opcreative/dashboard
```

Every box from Step 1 must tick. Then check the DS's per-screen definition of done against `docs/design-system/screenshots/reference/`:

- [ ] the hero title is **cream on sky** (a navy title here is the failure this rule exists to prevent)
- [ ] exactly one Craft Cut on the screen
- [ ] KPI numerals are Baloo 2, in navy, on pastel washes with no borders or shadows
- [ ] no chart has an invented zero
- [ ] the display face appears **only** in the hero title, the KPI numerals and the section headings

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/src/app/page.tsx apps/dashboard/src/components/pages/home
git commit -m "refactor(ds): home dashboards compose from Page/MetricCard/ChartFrame

The three role dashboards drop their hand-rolled KPI tiles and chart cards for
MetricCard (wash variant, tone matched to the metric's meaning) and ChartFrame.
The hero is the app's one brand moment: cream display title on saturated sky,
wood rings, one Craft Cut. Every figure is the same expression as before — no
rounding or formatting moved. No zero-filling was added to the un-zero-filled
backend series.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 20: Orders — the reference migration

This is the page the spec uses as its worked example, and it is the app's densest interaction surface: 16 files, ~90 handlers, 6 dialogs, 13 permission gates. Get this one right and the remaining list screens are mechanical.

**Files:**
- Modify: `apps/dashboard/src/app/(protected)/orders/page.tsx` (JSX wrapper only), `orders/print/page.tsx`
- Modify: `apps/dashboard/src/components/pages/orders/orders-table.tsx`, `status-summary.tsx`, `order-mobile-card.tsx`, `order-status-actions.tsx`, `order-qr.tsx`, `order-proof-action.tsx`, `print-labels-sheet.tsx`, and the six dialogs (`order-dialog`, `import-dialog`, `assign-dialog`, `artwork-dialog`, `refund-dialog`, `delete-orders-dialog`) — class strings and layout only
- Do NOT modify: `import-columns.ts`, `import-columns.test.ts`, `export-button.tsx`/`buy-labels-button.tsx`/`download-labels-button.tsx` logic, `@/modules/fulfillment/orders/*`
- Reference: `docs/design-system/ui_kits/seller-app/README.md` (Orders section — the longest and most load-bearing file in the DS), `docs/design-system/DOMAIN_RESOLVED.md` (order columns/actions/form-fields per role), `docs/design-system/components/data/DataTable.prompt.md`

**Interfaces:**
- Consumes: `Page`, `PageHeader` (Task 15), `StatusBadge` (Task 4), `FilterChip`, `SearchField` (Task 11), `DateRangeField` (Task 14), `ProductCell` (created in this task), `MetricCard` (Task 9), the reskinned `DataTable` (Task 10).
- Produces: `ProductCell` at `apps/dashboard/src/components/ds/product-cell.tsx` with `{ name?: string | null; code?: string | null; thumbnail?: string | null; className?: string }`, exported from the barrel. Tasks 22, 23 and 25 reuse it. Every existing export in `components/pages/orders/*` keeps its name and props.

- [ ] **Step 1: Build the inventory — this is the spec's own checklist, grounded in the code**

The spec lists 11 interactions for Orders. The code has more; all of them must survive. Read `orders-table.tsx` and confirm this list against it, then use it as the acceptance gate:

- [ ] **search** — `DataTableToolbar` → `params.setFilter("q", …)`, 300ms debounce, one round-trip
- [ ] **status filter** — the `Select` bound to `params.setFilter("status", …)`
- [ ] **tab filters** — `all` / `processing` / `attention`, canned status sets from `TABS` in `page.tsx` via `params.setFilter("tab", …)`
- [ ] **date filter** — `from` / `to`, which `orderStatusSummary` is date-range aware of
- [ ] **customer/warehouse filter** — `params.setFilter("customer", …)`
- [ ] **sort** — `DataTable` `sort` / `onSortChange`, asc → desc → none
- [ ] **pagination** — `page` + `size`, `DataTablePagination`
- [ ] **row click** — `onRowClick`
- [ ] **bulk select** — the `selected` Set, including select-all-on-page across pages
- [ ] **bulk: buy labels** — `BuyLabelsButton`, gated
- [ ] **bulk: download labels** — `DownloadLabelsButton`
- [ ] **bulk: assign** — `AssignDialog`, gated on `orders.assign`
- [ ] **bulk: recalculate** — `recalcOrdersAction` + its success toast
- [ ] **bulk: refund** — `RefundDialog`
- [ ] **bulk: delete** — `DeleteOrdersDialog`
- [ ] **export** — `ExportButton` (xlsx-js-style)
- [ ] **import** — `ImportDialog` (its column mapping is covered by `import-columns.test.ts`, which must still pass)
- [ ] **create order** — `OrderDialog`
- [ ] **per-row status actions** — `OrderStatusActions`, gated on `orders.status.update`
- [ ] **per-row artwork** — `ArtworkDialog`
- [ ] **per-row proof** — `OrderProofAction`
- [ ] **per-row QR** — `OrderQr` / `orderQrProps`
- [ ] **status summary strip** — `StatusSummary`, shown only for `orders.status.update` holders
- [ ] **mobile cards** — `OrderMobileCard` via `DataTable`'s `mobileCard`
- [ ] **print labels** — `/orders/print` + `print-labels-sheet.tsx`
- [ ] **permission gating** — all 13 `can(...)` / `<Can>` sites resolve exactly as before

That is 26, not 11. The spec's list is the floor, not the ceiling.

Capture the baseline before touching anything, so the "after" is comparable:

```bash
node --test apps/dashboard/src/components/pages/orders/import-columns.test.ts
```

- [ ] **Step 2: Create `ProductCell`**

The DS's `DataTable` example renders the product column through it. Create `apps/dashboard/src/components/ds/product-cell.tsx`:

```tsx
import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The product column of an operational table — ported from the design system's
 * `components/data/ProductCell`.
 *
 * Name in navy body type, code beneath it in mono (a SKU is a figure, per DS
 * rule 4). The thumbnail sits in a WHITE product well — the DS's one warm
 * exception is the cream product well on catalog surfaces, not here.
 */
export type ProductCellProps = {
  name?: string | null;
  /** SKU or variant code. Rendered in mono. */
  code?: string | null;
  thumbnail?: string | null;
  className?: string;
};

export function ProductCell({ name, code, thumbnail, className }: ProductCellProps) {
  return (
    <div data-slot="product-cell" className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="size-9 shrink-0 overflow-hidden rounded-(--radius-xs) border border-(--border-hairline) bg-(--surface-data)">
        {thumbnail && (
          <Image src={thumbnail} alt="" width={36} height={36} className="size-full object-cover" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-sans text-(length:--fs-body) font-semibold text-(--text-body)">
          {name ?? "—"}
        </p>
        {code && (
          <p className="truncate font-mono text-(length:--fs-meta) tracking-(--ls-mono) text-(--text-muted)">
            {code}
          </p>
        )}
      </div>
    </div>
  );
}
```

The `alt=""` is deliberate: the name is right beside it, so the image is decorative and a screen reader should skip it rather than read a filename. Add `export { ProductCell, type ProductCellProps } from "./product-cell";` to the barrel.

- [ ] **Step 3: Adopt `Page` + `PageHeader` in `orders/page.tsx`**

Replace only the returned `<main>`. The entire body above `return` — `searchParams` parsing, `one()`, `requireUser()`, the `can()` gate on `listWarehouses`, `showSummary`, the `Promise.all`, and the whole `rows.map` props construction — must be **byte-identical**:

```tsx
  return (
    <Page>
      <PageHeader meta={t("nav.orders")} title={t("orders.title")} subtitle={t("orders.subtitle")} tone="soft" />
      <OrdersTable
        total={total}
        summary={summary}
        warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }))}
        rows={/* unchanged */}
      />
    </Page>
  );
```

`tone="soft"` (pale sky, navy title) rather than `sky`: the home page is the app's brand moment and already spends the cream-on-sky hero. A list screen with a saturated hero pushes the table below the fold. Add any missing `orders.title` / `orders.subtitle` keys to all seven locales.

`page.tsx` is a server component, so `t()` must come from the server-side i18n entry the other server pages use — check how a sibling server page imports it and match that import exactly; do not make the page a client component to get `useTranslation`.

- [ ] **Step 4: Delete `statusVariant()` and use `StatusBadge`**

`orders-table.tsx` line ~227 renders:

```tsx
<Badge variant={statusVariant(o.status)}>{t(`orders.statuses.${o.status}`)}</Badge>
```

That local `statusVariant` helper is exactly the drift the DS's `STATUS_TONES` exists to end. Replace with:

```tsx
<StatusBadge status={o.status}>{t(`orders.statuses.${o.status}`)}</StatusBadge>
```

The translated label is still what renders (`children` overrides the label) and the colour now derives from the status string. Then delete the `statusVariant` function and the `Badge` import if nothing else in the file uses it:

```bash
grep -n "statusVariant\|<Badge" apps/dashboard/src/components/pages/orders/orders-table.tsx
```

Do the same in `order-mobile-card.tsx`, `status-summary.tsx` and `monitor-table.tsx` (the last one lands in Task 24 — note it there if you spot it here).

- [ ] **Step 5: The tab strip becomes `FilterChip`s**

Lines ~330-345 render the three tabs as `Button`s calling `params.setFilter("tab", …)`. Chips are the DS's control for canned filters, and they carry `aria-pressed` rather than `aria-current` because they filter rather than navigate:

```tsx
        {["all", "processing", "attention"].map((x) => (
          <FilterChip
            key={x}
            label={t(`orders.tabs.${x}`)}
            active={tab === x}
            onClick={() => params.setFilter("tab", x === "all" ? "" : x)}
          />
        ))}
```

Keep the `x === "all" ? "" : x` exactly — that is how "all" clears the param, and changing it would change the URL contract.

- [ ] **Step 6: Mono the figures, and the status summary strip**

In `orders-table.tsx`'s column definitions:

- `externalId` and any order id → `className="font-mono tracking-(--ls-mono)"` on the column
- `sku` → through `<ProductCell code={o.sku} name={o.productName} thumbnail={o.mockupThumbnail} />`
- `baseCost` (money) → `font-mono`, right-aligned
- `tracking` → `font-mono`
- `quantity` / `filled` → `font-mono`, right-aligned
- `placedAt` / `deadline` → body type, `--text-muted`

Do **not** change how any of these values are produced. `baseCost` arrives as an already-formatted string precisely so `Decimal` never crosses the boundary and no cent is lost to a float — leave that alone.

`status-summary.tsx` becomes a row of `<MetricCard variant="wash">` with the tone matched to each status's meaning via `toneFor(status)` from the DS layer, so the strip and the table's badges are the same colour for the same status.

- [ ] **Step 7: Row actions become ghost icon buttons in the last column**

The DS: *"Row actions are ghost IconButtons in the last column."* Lines ~287-310 already render `Button`s in a row-action cell; give them `variant="ghost" size="icon-sm"` and an `aria-label`, and keep every `onClick` and its `e.stopPropagation()` exactly as written — the `stopPropagation` is what stops a row action also firing the row click.

- [ ] **Step 8: The six dialogs — layout only**

`order-dialog`, `import-dialog`, `assign-dialog`, `artwork-dialog`, `refund-dialog`, `delete-orders-dialog` all render through the Task 12 primitives, so they are already reskinned. Touch them only to: group related fields into `<PageSection>`-style stacks with a consistent `gap-4`, put money and IDs in `font-mono`, and ensure each footer has exactly one `variant="default"` button. **No field, no validation, no submit handler and no schema may change** (rules 1, 6, 7).

`DOMAIN_RESOLVED.md` lists the order form fields and actions **per role**, read verbatim from the source. Check the dialogs against it: if a field it lists is missing, that is a finding to report — not something to add, because adding a field means inventing a payload.

- [ ] **Step 9: `/orders/print`**

`print-labels-sheet.tsx` renders for a printer, not a screen. Sky grounds and shadows waste toner and can render as grey blocks. Give the print sheet `bg-(--surface-data)` (white), navy ink, `font-mono` for every barcode number and order ID, and no shadows. If the file has a `@media print` block, keep it; if it does not, do not add one in this task — verify with a real print preview first and report what you find.

- [ ] **Step 10: Verify lint, build, adherence, and the import test**

```bash
node --test apps/dashboard/src/components/pages/orders/import-columns.test.ts
```

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Expected: all four PASS.

- [ ] **Step 11: Walk all 26 interactions from Step 1**

```bash
npm run dev -w @opcreative/dashboard
```

Tick every box in Step 1's list, in order. **26/26 or the page is not migrated.** Sign in as at least two roles (a seller and someone holding `orders.status.update`) so the gated interactions and the summary strip are actually exercised rather than assumed.

Then the DS's per-screen definition of done:

- [ ] built from ported components, not one-off markup
- [ ] every status is a `StatusBadge` sourced from `STATUS_TONES`
- [ ] IDs, SKUs, tracking and money are mono; nothing else is
- [ ] sky → shell (toolbar) → white (table) ladder is visible, and one Craft Cut
- [ ] no text lighter than navy-500; no opacity-dimmed small text
- [ ] focus rings intact; reduced motion silences the skeletons
- [ ] compare against the Orders reference PNG in `docs/design-system/screenshots/reference/`

- [ ] **Step 12: Commit**

```bash
git add apps/dashboard/src/app/\(protected\)/orders apps/dashboard/src/components/pages/orders apps/dashboard/src/components/ds
git commit -m "refactor(ds): Orders recomposed — 26/26 interactions preserved

The reference migration. Adopts Page/PageHeader, ProductCell, FilterChip for
the canned status tabs (aria-pressed, not aria-current) and MetricCard for the
status strip. Deletes the local statusVariant() helper: status colour now comes
from STATUS_TONES, so the strip and the badges agree. IDs, SKUs, tracking and
money take mono; row actions become ghost icon buttons in the last column.

Every handler, query, gate, schema and URL param is untouched — including
baseCost arriving pre-formatted so Decimal never crosses the boundary, and
setFilter('tab', x === 'all' ? '' : x) keeping the URL contract.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
---

### Task 21: Tickets and the support conversation

**Files:**
- Modify: `apps/dashboard/src/app/(protected)/tickets/page.tsx`, `tickets/[id]/page.tsx` (JSX wrappers only)
- Modify: `apps/dashboard/src/components/pages/support/tickets-table.tsx`, `ticket-thread.tsx`, `ticket-form-dialog.tsx`
- Reference: `docs/design-system/components/feedback/TicketConversation.d.ts` + `.prompt.md`, `SupportPanel.d.ts`, `docs/design-system/DOMAIN_RESOLVED.md` (`TICKET_REASON` → priority, read verbatim), `docs/design-system/BE_ALIGNMENT.md` (ticket replies are RESOLVED — the endpoint exists)

**Interfaces:**
- Consumes: `Page`, `PageHeader`, `PageSection` (Task 15), `StatusBadge` (Task 4), `Surface`, `KeyValueRow`, `SectionHeading` (Task 8), `Callout` (Task 13), the reskinned `DataTable` (Task 10).
- Produces: no signature changes. `TicketsTable`, `TicketThread`, `TicketFormDialog` keep their exports and props.

- [ ] **Step 1: Build the inventory** (`<group>` = `support`; expected 2026-09-03: 3 files, ~32 handlers, 1 dialog, 2 permission gates, 1 `DataTable`)

- [ ] search / filter / sort / paginate the ticket list
- [ ] row click → `/tickets/[id]`
- [ ] create ticket (`TicketFormDialog`) with its reason select and attachments
- [ ] post a reply on the detail page
- [ ] change ticket status, where permitted
- [ ] both permission gates resolve as before

- [ ] **Step 2: Wrap both routes**

`tickets/page.tsx` → `<Page><PageHeader meta={…} title={…} tone="soft" />…`. `tickets/[id]/page.tsx` → the same, with the ticket's subject as `title` and its id as `meta` in mono. Data-fetching bodies unchanged.

- [ ] **Step 3: Status and priority both become `StatusBadge`**

Ticket status (`open` / `in_progress` / `closed`) is already in `STATUS_TONES`. Priority is **not** a status: `DOMAIN_RESOLVED.md` gives the `TICKET_REASON` → priority mapping verbatim, so read priority from that mapping as the code already does and render it with an explicit `tone` — `critical` for the highest, `attention` for the middle, `neutral` for the lowest — rather than adding priority keys to `STATUS_TONES`. Do **not** invent a priority level that the mapping does not contain.

- [ ] **Step 4: `ticket-thread.tsx` becomes the `TicketConversation` look**

Reskin in place: each message is a `<Surface level={isStaff ? "inset" : "data"}>` block with the author, the role label (one of the seven real roles) and a mono timestamp; the reply composer is a `Textarea` plus one `variant="default"` button. Keep the send handler, the optimistic update if there is one, and the attachment upload exactly as they are. Ticket metadata (id, order reference, reason, created) goes into a `<Surface>` of `<KeyValueRow>`s beside the thread, with ids in mono.

If the thread shape is flagged unconfirmed anywhere in the DS docs, keep the placeholder visible rather than promoting it — `CLAUDE_CODE_HANDOFF.md` lists "the ticket thread shape" among the things to leave unconfirmed.

- [ ] **Step 5: Verify + walk**

```bash
npx turbo run lint --filter=@opcreative/dashboard && apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Then tick every box from Step 1 in the dev server, and check the reference PNG for the support screen.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/app/\(protected\)/tickets apps/dashboard/src/components/pages/support
git commit -m "refactor(ds): tickets list and conversation

Both routes compose from Page/PageHeader; the thread takes the DS's
TicketConversation treatment with metadata as KeyValueRows. Ticket status comes
from STATUS_TONES; priority is rendered with an explicit tone from the verbatim
TICKET_REASON mapping rather than being added to the status map, because it is
not a status. No send handler, upload or schema changed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 22: Catalog

The catalog is the one operational surface where the DS's **cream product well** belongs — it is a brand surface, and the DS names "product wells" as one of cream's sanctioned uses.

**Files:**
- Modify: `apps/dashboard/src/app/(protected)/catalog/page.tsx` (JSX wrapper only)
- Modify: `apps/dashboard/src/components/pages/catalog/catalog-browser.tsx`
- Reference: `docs/design-system/components/catalog/CatalogHero.d.ts`, `ProductCard.d.ts`, `SearchShell.d.ts` and their `.prompt.md` files

**Interfaces:**
- Consumes: `Page` (Task 15), `SearchField`, `FilterChip` (Task 11), `Surface` (Task 8), `ProductCell` (Task 20), `StatusBadge` (Task 4).
- Produces: no signature changes.

- [ ] **Step 1: Build the inventory** (`<group>` = `catalog`; expected: 1 file, ~4 handlers, 0 dialogs, 0 gates)

- [ ] search filters the product list
- [ ] category / filter controls narrow it
- [ ] a product card click still navigates or opens its detail
- [ ] the empty state appears when nothing matches

- [ ] **Step 2: The hero and the search shell**

`catalog/page.tsx` gets `<Page>` with `<PageHeader tone="cream" title={…} meta={…} />` — cream, because the catalog is a brand-forward surface and its title is therefore navy (display ink follows the surface). The search row becomes the DS's `SearchShell` pattern: a `<Surface level="content">` (cream) holding a `SearchField` plus `FilterChip`s, with the action slot on the right.

- [ ] **Step 3: Product cards**

Each card is a `<Surface level="data" radius="card" shadow="xs">` with the image in a **cream well** (`bg-(--surface-content)`), the name in navy body type, the SKU in mono, price in mono, and stock state as a `<StatusBadge>` (`In Stock` / `Low Stock` / `Out Of Stock` are all already in `STATUS_TONES`). The grid keeps whatever column counts it has — do not change the breakpoints; `RESPONSIVE.md` says what is and is not designed below 1024px, and the catalog grid is not one of the gaps.

Do not invent a rating: `guidelines/ALIGNMENT_AUDIT.md` § RESOLUTIONS closes the ratings question, and the resolution is what governs — read it before adding any star row.

- [ ] **Step 4: Verify + walk + commit**

```bash
npx turbo run lint --filter=@opcreative/dashboard && apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

```bash
git add apps/dashboard/src/app/\(protected\)/catalog apps/dashboard/src/components/pages/catalog
git commit -m "refactor(ds): catalog on the cream brand surface

The catalog is one of cream's sanctioned uses (product wells), so the hero is
cream with a navy title and each card's image sits in a cream well on a white
card. Search becomes the DS SearchShell pattern; stock state is a StatusBadge.
Grid breakpoints, search logic and navigation unchanged; no rating invented.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 23: Inventory — stock, movements and receipts

**Files:**
- Modify: `apps/dashboard/src/app/(protected)/inventory/page.tsx`, `inventory/movements/page.tsx`, `inventory/receipts/page.tsx` (JSX wrappers only)
- Modify: `apps/dashboard/src/components/pages/inventory/stat-tiles.tsx`, `stock-table.tsx`, `movements-table.tsx`, `receipts-table.tsx`, `adjust-stock-dialog.tsx`, `import-stock-dialog.tsx`, `receipt-form-dialog.tsx`, `receipt-detail-dialog.tsx`
- Reference: `docs/design-system/ui_kits/admin-app/` (physical-inventory screens), `docs/design-system/components/data/MetricCard.prompt.md`

**Interfaces:**
- Consumes: `Page`, `PageHeader` (Task 15), `MetricCard` (Task 9), `StatusBadge` (Task 4), `ProductCell` (Task 20), `Surface`, `KeyValueRow` (Task 8), the reskinned `DataTable` (Task 10).
- Produces: no signature changes. `StatTiles` keeps its props.

- [ ] **Step 1: Build the inventory** (`<group>` = `inventory`; expected: 8 files, ~67 handlers, 4 dialogs, 6 gates, 3 `DataTable`s)

- [ ] all three routes' search / filter / sort / paginate
- [ ] adjust stock (dialog) writes and the table refreshes
- [ ] import stock (dialog) accepts a file and runs
- [ ] create a receipt (dialog) and open a receipt's detail
- [ ] all 6 permission gates resolve as before
- [ ] the stat tiles reflect the current filter

- [ ] **Step 2: `stat-tiles.tsx` becomes `MetricCard`s**

This file is the app's clearest case of a hand-rolled KPI row. Replace each tile with `<MetricCard>`, tone by meaning: total SKUs → `neutral`; in stock → `success`; low stock → `attention`; out of stock → `critical`; pending receipts → `pending`. Keep the props the component receives and every number it computes.

- [ ] **Step 3: The three tables**

Stock levels, movements and receipts all use the reskinned `DataTable`. Per-table detail: SKU through `<ProductCell>`; quantities `font-mono` right-aligned; stock state a `<StatusBadge>`; movement direction as a small lucide arrow with the tone's ink (in = `--status-success-fg`, out = `--status-critical-fg`) rather than a coloured word; dates in body type, `--text-muted`. Receipt totals are money → mono.

`receipt-detail-dialog.tsx` becomes a `<Surface>` of `<KeyValueRow>`s — supplier, reference, dates as labels, ids and totals in mono — over the line-items table.

- [ ] **Step 4: Wrap the three routes** with `<Page><PageHeader tone="soft" …>`, then verify and walk

```bash
npx turbo run lint --filter=@opcreative/dashboard && apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Tick every Step 1 box across all three routes, at two roles.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/app/\(protected\)/inventory apps/dashboard/src/components/pages/inventory
git commit -m "refactor(ds): inventory stock/movements/receipts

stat-tiles becomes MetricCards with the tone matched to each figure's meaning.
The three tables take ProductCell, mono quantities and StatusBadge stock states;
movement direction is an arrow in the tone's ink rather than a coloured word.
Receipt detail becomes KeyValueRows. Every dialog handler and gate unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 24: Fulfillment monitor

The two workstations were done in Task 18 (they needed the admin chrome). This task finishes the group with the monitor board.

**Files:**
- Modify: `apps/dashboard/src/app/(protected)/fulfillment/page.tsx`, `fulfillment/quick/page.tsx`, `fulfillment/monitor/page.tsx` (JSX wrappers only)
- Modify: `apps/dashboard/src/components/pages/fulfillment/monitor-table.tsx`
- Reference: `docs/design-system/ui_kits/warehouse-app/`, `docs/design-system/BACKEND_GAPS.md` §"scan-mutates-on-GET" and §"QC has no state"

**Interfaces:**
- Consumes: `Page`, `PageHeader` (Task 15), `StatusBadge` (Task 4), `MetricCard` (Task 9), the reskinned `DataTable` (Task 10).
- Produces: no signature changes.

- [ ] **Step 1: Build the inventory** (`<group>` = `fulfillment`; expected: 13 files, ~59 handlers, 4 dialogs, 1 gate — most already exercised in Task 18)

- [ ] the monitor board's filter / sort / auto-refresh (if it polls, the interval must not change)
- [ ] row click through to the order
- [ ] the station and quick-scan flows still pass their Task 18 walk

- [ ] **Step 2: Wrap the three routes and reskin the monitor**

`<Page><PageHeader tone="soft" meta={t("fulfillment.nav.section")} title={…} />`. In `monitor-table.tsx`: order ids and tracking numbers in mono; every status a `<StatusBadge>` (this is the file noted in Task 20 Step 4 — check it no longer hand-picks a badge variant); any count strip becomes `MetricCard`s. The monitor is read at a distance on a wall screen, so keep whatever larger type it already uses and do not shrink anything to fit the DS's default body size.

- [ ] **Step 3: Verify + walk + commit**

```bash
npx turbo run lint --filter=@opcreative/dashboard && apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

```bash
git add apps/dashboard/src/app/\(protected\)/fulfillment apps/dashboard/src/components/pages/fulfillment
git commit -m "refactor(ds): fulfillment routes wrapped; monitor board on StatusBadge

Completes the group started in Task 18. Monitor gets mono ids and tracking,
StatusBadge statuses and MetricCard counts, while keeping its larger
read-at-a-distance type. No poll interval, scan handler or QC state touched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 25: The admin CRUD screens

Twelve routes, 36 files, ~272 handlers, 22 dialogs, 13 tables, 22 permission gates — and they are **homogeneous**: each is a list plus create/edit/delete dialogs. One task, worked route by route, because splitting them would mean thirteen near-identical reviews.

**Routes:** `/admin/users`, `/admin/warehouses`, `/admin/vendors`, `/admin/materials`, `/admin/products`, `/admin/products/[id]/variants`, `/admin/variants`, `/admin/boms`, `/admin/mockups`, `/admin/transactions`, `/admin/expenses`, `/admin/audit`.

**Files:**
- Modify: the twelve `page.tsx` files under `apps/dashboard/src/app/(protected)/admin/` (JSX wrappers only)
- Modify: all 36 files under `apps/dashboard/src/components/pages/admin/`
- Reference: `docs/design-system/ui_kits/admin-app/` (incl. BOM/materials/physical-inventory/expenses/vendors), `docs/design-system/DOMAIN_RESOLVED.md`, `docs/design-system/types/domain.d.ts` (the real payload shapes)

**Interfaces:**
- Consumes: `Page`, `PageHeader` (Task 15), `StatusBadge` (Task 4), `ProductCell` (Task 20), `Surface`, `KeyValueRow`, `SectionHeading` (Task 8), `MetricCard` (Task 9), `Callout` (Task 13), the reskinned `DataTable` (Task 10) and dialog primitives (Task 12).
- Produces: no signature changes anywhere in the group.

- [ ] **Step 1: Build the inventory once for the whole group**

```bash
cd apps/dashboard/src/components/pages/admin
grep -rn 'can("' . --include='*.tsx' | tee /tmp/gwp-admin-gates.txt | wc -l
ls */*dialog*.tsx | wc -l
grep -rl "DataTable" . --include='*.tsx' | wc -l
```

Expected (2026-09-03): 22 gate sites, 22 dialogs, 13 tables. Save `/tmp/gwp-admin-gates.txt` — Step 5 diffs against it to prove no gate moved.

- [ ] **Step 2: Wrap all twelve routes**

Each `page.tsx`'s `<main>` becomes `<Page>` with `<PageHeader tone="soft" meta={t("nav.admin")} title={t("<route>.title")} />`. **Every data-fetching body is untouched.** Admin routes take the white bar chrome and the `--field-admin` dissolve from Task 18 automatically; nothing per-page is needed for that.

Work them in this order, committing after every three so a bad route is easy to isolate: users → warehouses → vendors, then materials → products → variants, then products/[id]/variants → boms → mockups, then transactions → expenses → audit.

- [ ] **Step 3: Apply the same four table rules to all thirteen tables**

1. Every status, state or active/inactive flag → `<StatusBadge>` (`Active` is in `STATUS_TONES`; for a boolean flag pass an explicit `tone`).
2. Every id, code, SKU and money figure → `font-mono`; money right-aligned. Product rows → `<ProductCell>`.
3. Row actions → ghost icon buttons in the last column, each with an `aria-label`, each keeping its `stopPropagation`.
4. The toolbar's primary action → exactly one `variant="default"` button, on the right.

- [ ] **Step 4: The 22 dialogs — layout only**

Group fields into stacks with a uniform `gap-4`; one `variant="default"` per footer; the delete confirms use `variant="destructive"` (white pill, red ink). Where a dialog shows a summary before acting (`approve-dialog`, `balance-dialog`, `bulk-prices-dialog`), that summary becomes `<KeyValueRow>`s with mono figures. Where one warns (`delete-*-dialog`), the warning becomes a `<Callout tone="critical">`.

**No field, validation rule, schema or submit handler changes.** Check each dialog's fields against `docs/design-system/DOMAIN_RESOLVED.md` and `types/domain.d.ts`: report a mismatch, never reconcile it by adding a field. `BACKEND_GAPS.md` §E lists models left as placeholders — a dialog for one of those keeps its placeholder.

Two specific hazards from `BE_ALIGNMENT.md` to respect on `/admin/transactions` and `/admin/expenses`: the **billing buckets are server-defined** (do not compute your own), and **`/admin/v1/*` is x-api-key integration only** (not a UI endpoint). Neither is something this task changes — but neither may be worked around in the UI either.

- [ ] **Step 5: Prove no permission gate moved**

```bash
cd apps/dashboard/src/components/pages/admin
grep -rn 'can("' . --include='*.tsx' > /tmp/gwp-admin-gates-after.txt
diff /tmp/gwp-admin-gates.txt /tmp/gwp-admin-gates-after.txt && echo "GATES UNCHANGED"
```

Expected: `GATES UNCHANGED` (line numbers may shift; if the diff shows only line-number changes with identical permission strings, that is acceptable — re-check by comparing the sorted permission strings alone). Any added, removed or altered permission string is a rule-5 violation: revert it.

- [ ] **Step 6: Verify and walk all twelve routes**

```bash
npx turbo run lint --filter=@opcreative/dashboard && apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

For **each** of the twelve routes: search, filter, sort, paginate, create, edit, delete, and every gated action — signed in as an admin, then as a non-admin to confirm the gates still hide what they hid. Twelve routes × those checks is the bulk of this task's time; do not sample.

- [ ] **Step 7: Commit** (four commits, one per group of three, then this one for the group)

```bash
git add apps/dashboard/src/app/\(protected\)/admin apps/dashboard/src/components/pages/admin
git commit -m "refactor(ds): the twelve admin CRUD screens

All twelve routes compose from Page/PageHeader and take the white admin bar
chrome plus the sanctioned sky->white dissolve from Layer 3. The thirteen
tables get StatusBadge states, mono ids/codes/money, ProductCell product rows
and ghost row actions; the 22 dialogs get uniform field stacks, one primary
button each, KeyValueRow summaries and Callout warnings.

All 22 permission gates verified byte-identical. No field added to any dialog:
mismatches against DOMAIN_RESOLVED.md and domain.d.ts are reported, not
reconciled, and BACKEND_GAPS.md placeholders stay placeholders.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 26: Profile, wallet, notifications, invite and login

**Files:**
- Modify: `apps/dashboard/src/app/(protected)/profile/{page,security,api,webhooks,billing}/page.tsx` + `profile/layout.tsx`, `notifications/page.tsx`, `apps/dashboard/src/app/invite/[token]/page.tsx` (JSX wrappers only)
- Modify: `apps/dashboard/src/components/pages/profile/*` (9 files), `notifications/notifications-list.tsx`, `invite/accept-invite.tsx`, `auth/login-screen.tsx`, `auth/password-input.tsx`, `auth/reset-password.tsx`
- Do NOT modify: `auth/auth-actions.ts`, `profile/api-migration-map.ts`
- Reference: `docs/design-system/components/data/WalletSummary.d.ts` + `.prompt.md`, `ShareBar.d.ts`, `docs/design-system/ui_kits/system/SystemAuth.html`, `docs/design-system/BE_ALIGNMENT.md` (paginated billing transactions + type enum are RESOLVED)

**Interfaces:**
- Consumes: `Page`, `PageHeader`, `PageSection` (Task 15), `Surface`, `KeyValueRow`, `SectionHeading` (Task 8), `MetricCard` (Task 9), `StatusBadge` (Task 4), `Callout` (Task 13), `GwpMark`, `CraftCut` (Task 15).
- Produces: no signature changes.

- [ ] **Step 1: Build the inventory** (`<group>` = `profile`, then `notifications`, `invite`, `auth`; expected: 9 + 1 + 1 + 4 files, ~52 + 14 + 1 + 17 handlers, 1 dialog, 1 `DataTable`)

- [ ] profile form saves
- [ ] security panel: password change, and any 2FA/session actions
- [ ] API keys: create, copy, revoke
- [ ] webhooks: create, edit, delete, test
- [ ] billing: the transactions table paginates, and the money-request dialogs submit
- [ ] notifications: mark read, mark all read, and each notification's link
- [ ] invite: accept flow completes
- [ ] login: email+password, Google OAuth, email OTP, and reset-password — **all four**

- [ ] **Step 2: The profile group**

`profile/layout.tsx` already renders the section tabs (they come from `NAV_SECTIONS`, reskinned in Task 17). Each of the five pages becomes `<Page><PageHeader tone="soft" meta={t("profile.title")} title={t("profile.tabs.<x>")} />` plus `<PageSection>`s of `<Surface>`. `settings-card.tsx` is the group's local card wrapper — reskin it to wrap `<Surface>` rather than re-implementing a panel, keeping its props.

`api-keys-panel.tsx`: keys are secrets — render them `font-mono`, truncated, with the existing copy button; do not change how or when a key is revealed. `webhooks-panel.tsx`: URLs in mono, delivery state as a `<StatusBadge>`. `phone-input.tsx`: keep `libphonenumber-js` and its validation exactly; only the field styling changes.

- [ ] **Step 3: Billing becomes the `WalletSummary` treatment**

The wallet is money, so it is the strictest surface in the app for DS rule 4: **every figure is mono**. The balance block becomes a `<Surface level="data">` with the balance as a `MetricCard tone="action"` (display face, navy) and the sub-figures as `<KeyValueRow mono>`s. `transactions-table.tsx` gets mono amounts right-aligned, transaction type as a `<StatusBadge>` with an explicit tone, and mono ids.

`BE_ALIGNMENT.md` records that the billing buckets are **server-defined** and that paginated transactions plus a type enum now exist. Read the type from the API as the code already does; do not derive a client-side category, and do not compute a bucket.

`money-request-dialogs.tsx` handles deposits/withdrawals. Layout only — **no amount parsing, rounding, currency handling or submit path may change**. Money is the one place where a "harmless" formatting tweak is a real bug.

- [ ] **Step 4: Notifications, invite and login**

- `notifications-list.tsx` — each row a `<Surface level="data">`; unread marked with an `--status-attention-dot`, not a background tint; timestamps in body type; type icons in the tone's stroke colour. Keep every mark-read handler.
- `accept-invite.tsx` — a single centred `<Surface level="data">` on the sky ground, with `GwpMark` above it.
- `login-screen.tsx` — the app's front door and its second brand moment. `SystemAuth.html` in the DS is the reference. Sky ground, a centred white or cream card, `GwpMark` above the form, one `CraftCut` in the composition, and the three sign-ins each as a clearly separate action: email+password as the `variant="default"` submit, Google as `variant="outline"` with its existing `google-icon.tsx`, and the OTP path as `variant="link"`. `password-input.tsx` keeps its reveal toggle; `input-otp` keeps its slot behaviour. **`auth-actions.ts` is not touched.**

- [ ] **Step 5: Verify and walk all four sign-in paths**

```bash
npx turbo run lint --filter=@opcreative/dashboard && apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

Sign out and sign back in through **email+password** (the seeded local account is `test@opcreative.dev` / `newpass9`, per the repo's CLAUDE.md), then check that the Google button still initiates OAuth and the OTP form still sends. Then tick every remaining Step 1 box.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/app/\(protected\)/profile apps/dashboard/src/app/\(protected\)/notifications apps/dashboard/src/app/invite apps/dashboard/src/components/pages/profile apps/dashboard/src/components/pages/notifications apps/dashboard/src/components/pages/invite apps/dashboard/src/components/pages/auth
git commit -m "refactor(ds): profile, wallet, notifications, invite and the login screen

The five profile routes compose from Page/PageHeader/Surface; billing takes the
WalletSummary treatment with every figure in mono and server-defined buckets
read as-is. Login becomes the app's second brand moment (sky ground, GwpMark, a
Craft Cut) with the three sign-ins visually separated by button variant.

No money parsing, rounding or currency handling moved; auth-actions.ts, the
phone validator and the API-key reveal behaviour are untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 27: Close-out — adherence, dead tokens and the VERIFY pass

**Files:**
- Modify: `apps/dashboard/src/app/globals.css` (remove what is now unreferenced)
- Modify: `apps/dashboard/scripts/check-ds-adherence.sh` (add the final checks)
- Create: `docs/design-system-migration-report.md`
- Modify: `apps/dashboard/CLAUDE.md` and `apps/dashboard/DESIGN-VERCEL.md`
- Reference: `docs/design-system/VERIFY.md`, `docs/design-system/A11Y.md`, `docs/design-system/_adherence.oxlintrc.json`

**Interfaces:**
- Consumes: everything.
- Produces: the migration report, and a repo whose docs no longer point at the wrong design system.

- [ ] **Step 1: Retire the Vercel design spec as the app's authority**

`apps/dashboard/DESIGN-VERCEL.md` (26 KB) is currently described in `apps/dashboard/CLAUDE.md` as "the OFFICIAL Geist spec … consult it when building/polishing any dashboard UI". After this migration that instruction sends the next contributor to the wrong system — and the DS explicitly names the old theme among the sources that will mislead.

Do not delete the file (it documents what was built and why). Rename it `DESIGN-VERCEL.ARCHIVED.md`, add a header pointing at the new authority, and rewrite the corresponding section of `apps/dashboard/CLAUDE.md`:

```markdown
- **Design spec**: `docs/design-system/` is the OFFICIAL GoodWoodPrint design
  system — read `SKILL.md` (the four rules, one page), then `readme.md` (the
  full rulebook) before building or polishing any UI. Tokens live in
  `src/app/gwp.theme.css` (generated); never add a colour outside it. Status
  colour comes only from `src/components/ds/status-tones.ts`, never from the
  backend's `metadata.ts` theme/color literals. Run
  `apps/dashboard/scripts/check-ds-adherence.sh` before committing UI changes.
  `DESIGN-VERCEL.ARCHIVED.md` is the pre-migration Geist spec — history, not
  authority.
```

Also update the root `CLAUDE.md`'s "Vercel design spec" bullet the same way, and its "shadcn base-nova" bullet to note that primitives are now GWP-skinned in place.

- [ ] **Step 2: Remove the tokens nothing references any more**

```bash
cd apps/dashboard
for t in vercel-blue vercel-purple vercel-pink vercel-cyan vercel-green vercel-yellow vercel-red vercel-orange vercel-violet vercel-magenta vercel-amber vercel-coral vercel-teal gradient-develop gradient-preview gradient-ship brand-gradient brand-mesh grid-line ease-geist; do
  n=$(grep -rl -- "$t" --include='*.tsx' --include='*.ts' src | wc -l)
  echo "$t: $n call sites"
done
```

Delete from `globals.css` every token whose count is 0. Any with a count above 0 is a Layer 1–4 task that missed a call site — fix the call site, then delete the token. Do the same sweep for the `--gray-alpha-*` scale and the `--text-display-*` / `--text-body-*` type scale.

- [ ] **Step 3: Strengthen the adherence gate with the checks that only make sense now**

Append three checks to `check-ds-adherence.sh`, before the summary:

```bash
report "status rendered as anything but StatusBadge (must be empty)"
if grep -rn '<Badge[^>]*status\|statusVariant\|statusColor\|STATUS_COLORS' \
     --include='*.tsx' src/components/pages; then
  echo "FAIL: a page is picking a status colour by hand"; fail=1
else echo "ok"; fi

report "pages hand-rolling a page container (must be empty)"
if grep -rn 'max-w-7xl' --include='*.tsx' src/app src/components/pages \
     | grep -v 'components/ds/page.tsx'; then
  echo "FAIL: a page is not using <Page>"; fail=1
else echo "ok"; fi

report "display face used outside titles/KPIs (review each hit)"
grep -rn 'font-display' --include='*.tsx' src/components src/app | grep -v 'components/ds/'
echo "(informational — DS rule 4 rations Baloo 2 to brand moments, page titles and KPI numbers)"
```

The third is informational rather than failing, because a legitimate new title would trip it. Run the gate and resolve everything it flags:

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

- [ ] **Step 4: Run the DS's own verification pass**

`docs/design-system/VERIFY.md` gives the measurable definition of "matches the design" — render reference vs build, and a per-screen token/type/layout/state checklist. Work it per screen against `docs/design-system/screenshots/reference/*.png`. Then `docs/design-system/A11Y.md`'s per-component contract (role, keyboard, focus, labelling) and its per-screen checklist.

Record the result honestly in the report — including screens that do not match and why. A screen that differs because our app has a feature the DS never drew is a **finding**, not a failure; a screen that differs because a rule was missed is a bug to fix now.

- [ ] **Step 5: Write the migration report**

Create `docs/design-system-migration-report.md` covering:

- the layer-by-layer summary, with the commit range for each layer
- the three-group mapping as **built** (which components turned out to be A, B or C in practice, versus the plan's guess)
- **per-page interaction parity**: the inventory count and the verified count for each of the nine Layer 4 tasks (Orders: 26/26, and so on). This is the spec's definition of done, so it is the report's headline table.
- every DOMAIN-BOUND field left as a placeholder, and where
- every mismatch found against `DOMAIN_RESOLVED.md`, `types/domain.d.ts`, `BACKEND_ASKS.md` and `BACKEND_GAPS.md` — reported, not reconciled
- what `VERIFY.md` and `A11Y.md` passed, what did not, and why
- the open items: the dark-mode decision as implemented, the top-level nav item count from Task 17 Step 8, any un-zero-filled chart from Task 19 Step 4, and anything else raised along the way

- [ ] **Step 6: Full verification**

```bash
node --test apps/dashboard/src/components/ds/status-tones.test.ts
```

```bash
node --test apps/dashboard/src/components/pages/orders/import-columns.test.ts
```

```bash
node --test libs/shared/src/access/permissions.test.ts
```

```bash
node --test apps/dashboard/src/config/nav-tabs.test.ts apps/dashboard/src/lib/time-period.test.ts
```

```bash
apps/dashboard/scripts/check-ds-adherence.sh
```

```bash
npx turbo run lint --filter=@opcreative/dashboard
```

```bash
DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder AUTH_SECRET=ci-build-only npx turbo run build --filter=@opcreative/dashboard
```

All seven must pass. **Do not report the migration complete on fewer.** If one fails, say which and why in the report rather than in a commit message.

- [ ] **Step 7: Commit**

```bash
git add docs apps/dashboard/CLAUDE.md apps/dashboard/DESIGN-VERCEL.ARCHIVED.md CLAUDE.md apps/dashboard/src/app/globals.css apps/dashboard/scripts/check-ds-adherence.sh
git commit -m "docs(ds): retire the Geist spec as authority, add the migration report

CLAUDE.md now points at docs/design-system as the design authority;
DESIGN-VERCEL.md is archived as history. Removes every Vercel-era token with
zero remaining call sites and strengthens the adherence gate with the checks
that only make sense post-migration (no hand-picked status colours, no page
hand-rolling its own container).

Reports per-page interaction parity, the as-built A/B/C mapping, every
DOMAIN-BOUND placeholder and every backend mismatch found — reported, not
reconciled.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review

Run against the spec after the plan is written; findings fixed inline.

**1. Spec coverage.**

| Spec requirement | Task(s) |
|---|---|
| Preserve business logic / hooks / API calls / routes / permissions / schemas / handlers (rules 1–7) | Global Constraints, enforced per task; verified by Task 10 Step 3, Task 25 Step 5 |
| Adapters where the DS API differs (rule 9) | 10 (DataTable), 11 (toolbar/pagination), 12 (form dialog), 4 (StatusBadge), 17 (nav) |
| Don't rewrite working features to fit the DS (rule 8) | Stated in Global Constraints; Task 10 is the worked case |
| Every previous interaction preserved (rule 10) | The interaction-inventory protocol opening Layer 4; per-task checklists |
| Component mapping first, in three groups | The mapping table; Groups A/B/C are Tasks 3–14 and 7 respectively |
| Layer 1 primitives (Button, Input, Checkbox, Radio, Select, Textarea, Badge, Tooltip, IconButton) | 3, 4, 5, 6, 7 |
| Layer 2 composite (Card, MetricCard, Modal, Drawer, Dropdown, Tabs, Pagination, Table, Filters, DateRange) | 8, 9, 10, 11, 12, 13, 14 |
| Layer 3 shell, done once not per page (AppHeader, Navigation, PageContainer, PageHeader, UserMenu, Notifications) | 15, 16, 17, 18 |
| Layer 4 page composition only (spacing, grouping, hierarchy, toolbar, card placement) | 19–26 |
| `<Page><PageHeader/><PageToolbar/><DataTable/>` composition, not per-page UI | Task 15 builds it; Layer 4's page recipe mandates it; Task 27 Step 3 gates it |
| Orders parity checklist | Task 20 Step 1 — grounded at 26 items, exceeding the spec's 11 |
| DS non-negotiables (four rules, STATUS_TONES, never invent, contrast floor) | Global Constraints; Tasks 2, 4, 15; Task 27 Step 4 |

Gaps found and closed while reviewing: the spec names "Wallet" and "System" as pages, which map to `/profile/billing` and the `/admin/*` group in this codebase rather than to routes of those names — recorded in Tasks 26 and 25 so nobody goes looking for `/wallet`. The spec's "Radio" primitive has no DS equivalent, so it is Group C (Task 7) rather than Layer 1; noted in the mapping table.

**2. Placeholder scan.** No "TBD", no "add appropriate error handling", no "similar to Task N". Three places deliberately instruct *investigation* rather than prescribing code, each with the check to run and both branches spelled out: Task 13's Base UI state-attribute names (`data-[selected]` / `data-pressed` — must be read from the file, because guessing yields a tab bar with no active state), Task 16 Step 2's `SidebarProvider` dependency, and Task 18 Step 2's `x-pathname` header. Those are not placeholders — prescribing an unverified selector would be worse than telling the implementer which line to read.

**3. Type consistency.** `toneFor` / `STATUS_TONES` / `StatusTone` (Task 2) are used under exactly those names in Tasks 4, 20, 21, 23. `Page` / `PageHeader` / `PageToolbar` / `PageSection` (Task 15) match every Layer 4 usage. `MetricCard`'s `tone` union (`action | progress | success | critical | attention | pending | neutral`) is a superset of `StatusTone` by one member (`action`) and short by none — deliberate, since `action` is a surface duty rather than a status, and the two types are never assigned to each other. `Surface`'s `level` union matches `surfaces.css`. `ProductCell` is created in Task 20 and consumed in 22, 23, 25 with the same three props. `Button`'s prop is `variant` everywhere — shadcn's real name, restored by Task 0b after the upstream mangle had renamed it to `product`. The plan originally enshrined `product` as a fact of the codebase; that was reading the vandalism as intent.
