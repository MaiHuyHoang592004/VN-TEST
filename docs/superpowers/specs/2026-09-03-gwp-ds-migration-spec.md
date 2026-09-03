# Spec — Migrate the dashboard FE onto the GoodWoodPrint Design System

**Date:** 2026-09-03 · **Author:** user request, transcribed verbatim in intent
**Status:** approved for planning

## 1. Goal

Re-skin `apps/dashboard` onto the **GoodWoodPrint (GWP) Fulfillment Design
System** while **preserving every line of business logic**. This is a
component-mapping exercise, not a redesign programme.

```
Business logic hiện tại
  API / hooks / state / permission / validation
                │
                │ GIỮ NGUYÊN  (immutable)
                ▼
Page logic hiện tại
                │
                ▼
GoodWoodPrint Design System
  Button · Input · Select · Card · Table · Badge · Modal · Tabs · Navigation …
```

The unit of change is the **component implementation**, never the call site's
behaviour:

```tsx
<button onClick={handleSubmit} disabled={loading} className="…">Save</button>
// becomes
<Button onClick={handleSubmit} disabled={loading}>Save</Button>
```

`handleSubmit` is not touched. Same for inputs — the search logic behind
`<Input value={search} onChange={…} />` is untouched.

## 2. Migration rules (hard constraints)

1. Existing business logic is immutable.
2. Existing hooks are reused.
3. Existing API / service / server-action calls are reused.
4. Existing route paths must not change.
5. Existing permission checks must not change.
6. Existing form schemas must not change.
7. Existing event handlers are passed into the new DS components.
8. Do not rewrite a working feature merely to match the DS API.
9. Use adapters when the DS interface differs.
10. A migrated page must preserve **every** previous interaction.

## 3. Component mapping is step one — not page redesign

Before any page is touched, classify every component into three groups:

- **Group A — 1:1 equivalent exists** → replace directly.
- **Group B — DS has it but the API differs** → write an adapter. Do NOT
  rewrite the feature to fit the DS signature. Example: the DS `DataTable`
  takes `rows`/`columns`, but the app's table already carries pagination,
  sorting, selection, server filtering, row actions and permissions. Keep the
  app-level `DataTable` adapter; render GWP's look *inside* it. The page must
  not know anything changed.
- **Group C — DS has no equivalent** → keep the existing component, restyle it
  to the DS token contract only.

## 4. Four layers, in order

**Layer 1 — primitives.** Button, Input, Checkbox, Radio, Select, Textarea,
Badge, Tooltip, IconButton. Lowest risk, changes the face of the whole app
fastest.

**Layer 2 — composite.** Card, MetricCard, Modal, Drawer, Dropdown, Tabs,
Pagination, Table, Filters, DateRange. App now looks 60–70% different.

**Layer 3 — shell.** AppHeader, Navigation, PageContainer, PageHeader,
UserMenu, Notifications. This is where the Vercel-style sidebar becomes GWP
top navigation. **Do the shell once, not per page** — change `AppShell` and
every route inherits it.

**Layer 4 — page composition.** Dashboard, Orders, Products, Inventory,
Wallet, Tickets, Fulfillment, System… Only spacing, grouping, hierarchy,
toolbar and card placement — not component rewrites.

## 5. The anti-pattern this spec exists to prevent

Do NOT walk the routes redesigning each one (`/orders` → redesign, `/products`
→ redesign, …). After 20 pages that produces 17 paddings, 9 card styles, 5
button styles, 3 filter styles and 4 table headers — and the design system
becomes meaningless. Pages must compose:

```tsx
<Page>
  <PageHeader />
  <PageToolbar />
  <DataTable />
</Page>
```

…and feed data in.

## 6. Definition of done, per page

Every interaction that existed before must exist after. Orders, for example,
must still do all of: search · status filter · date filter · sort ·
pagination · row click · bulk select · bulk action · export · create order ·
edit · cancel. Missing one means the page is not migrated.

## 7. Design-system authority

`GoodWoodPrint Fulfillment Design System` (Claude Design project
`3276900d-15c6-4f7a-87c2-b81c69a606b7`; local export used for this work).
Its own non-negotiables bind this migration:

- The four rules in the DS `SKILL.md` (sky is the page & cool leads · cross the
  sky/cream boundary with a Craft Cut · display ink follows the surface ·
  ration the display face).
- Status colour comes only from `STATUS_TONES` / `--status-*`, never from
  backend `metadata.ts` theme/color literals.
- Never invent order states, roles, SKU/BOM rules, wallet semantics, or
  production/shipping lifecycles. Ship the documented placeholder instead.
- Contrast floor: nothing lighter than navy-500 on a light ground; no
  opacity-based de-emphasis on small text.

Sources the DS explicitly forbids as styling input: backend `metadata.ts`
palette, the old graphite `tokens.css`, Metronic demo1 chrome.
