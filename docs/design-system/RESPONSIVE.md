# Responsive spec

The kit is authored **desktop-first**. Every `ui_kits/*.html` is designed and
verified at **≥1024px** — that is the kit's floor, and `TopNav` has no collapse
behaviour below it yet (stated in `CLAUDE_CODE_HANDOFF.md`). This file defines
the breakpoints and the per-surface behaviour an AI import should implement, so
"below 1024px" is a specified target, not an invented one.

> **Rule for AI import:** do not silently invent a mobile layout that isn't
> described here. Where a surface says "not yet designed below X", ship the
> desktop layout down to that width and raise the gap rather than guessing.

## Breakpoints

No breakpoint tokens ship in `tokens/spacing.css` today (only layout dimensions:
`--content-max` 1280, `--content-max-marketing` 1200, `--gutter` 32, and
`--gutter-mobile` 16 — the one signal that a mobile gutter is intended). Adopt
this scale; it matches the two gutters already defined:

| Name | Range | Primary use |
|---|---|---|
| `sm` | < 640px | phone — marketing + auth + catalog only |
| `md` | 640–1023px | tablet — marketing + catalog; operational screens degrade gracefully |
| `lg` | 1024–1279px | **the kit floor** — full operational layouts |
| `xl` | ≥ 1280px | `--content-max`; centred with `--gutter` |

Switch `--gutter` (32) → `--gutter-mobile` (16) at `md` and below. Touch targets
go to `--touch-min` (44px) below `md` (already the system minimum).

## Per-surface behaviour

**Marketing (`Landing`, `HowItWorks`) + Catalog (`Buyer*`) + System (`System*`)**
— must work down to `sm`. These are public/buyer surfaces where mobile is real
traffic. Hero type steps down (marketing 56–64 → ~36 at `sm`); `MarketingHero`
and `FeatureCard` grids collapse to one column; `CatalogHero` search stays full
width; product grid goes 4→2→1 columns; the floating cream `TopNav` collapses
its links behind a menu button (design the button; the kit shows the desktop bar).

**Operational (seller `TopNav`, admin `TopNav`/`AdminBar`, warehouse `AdminBar`)**
— designed for `lg`+. Down to `md` keep the layout and let horizontal regions
scroll:
- **`DataTable`** — the table scrolls horizontally inside its surface; the
  sticky header and row rules are preserved. Never reflow a wide operational
  table into stacked cards without a product decision — column meaning is
  positional (see `DOMAIN_RESOLVED.md` §2).
- **KPI row (`MetricCard`)** — wraps 4→2→1; never shrinks a tile below legible.
- **Two-pane detail (`Drawer`, ticket thread, `SupportPanel`)** — the drawer is
  already `fixed` full-height from the right; below `md` it takes the full width.
- **Filter bars (`SearchShell`, `TabBar.right`)** — controls wrap to a second
  row; the search field takes the full width first.
- **Warehouse scan stations** — single-column workstation layout already; they
  scale down cleanly to tablet, the intended floor for a scanning device.

**Admin `Sidebar`** — off-canvas below `lg` (slide-over with the same scrim as
`Drawer`); it is a documented component, not a current admin screen.

## What is NOT yet designed

A true phone layout for any **operational** screen (dashboard, orders, tables,
scan). If the product needs one, it is a design task, not an import inference —
flag it rather than reflowing a table to cards on your own.
