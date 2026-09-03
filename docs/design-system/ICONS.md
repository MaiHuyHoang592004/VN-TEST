# Iconography — the license decision

**Decision: ship Lucide as the canonical icon set.** The production frontend
uses **KeenIcons**, the icon font bundled with the Metronic admin template
(`src/components/keenicons/`). That font is **commercially licensed to the
Metronic template** and cannot be redistributed inside this design system, so it
was deliberately not copied in. Lucide (`https://unpkg.com/lucide@0.462.0`) is
the closest freely-redistributable match: single-weight 2px outline, rounded
terminals, ~24px optical grid — the same construction as the approved reference
art.

**For AI import:** use Lucide unless GWP confirms it owns a KeenIcons
redistribution licence. If it does, swap per the table below and keep every
other icon rule (2px stroke at all sizes, `--icon-*` colours, tinted chips)
unchanged — only the glyph source changes.

## KeenIcon → Lucide map (the glyphs the source actually uses)

Read from `OrderActionButtons.jsx`, `ProductToolbar.jsx` and the module nav.
KeenIcon name on the left (as written in source), Lucide component on the right.

| KeenIcon | Lucide | Used for |
|---|---|---|
| `plus` | `Plus` | Add order |
| `add-files` | `FilePlus` | Import |
| `file-down` | `FileDown` | Download template / label |
| `file-up` | `FileUp` | Export |
| `picture` | `Image` | Build design previews |
| `print` | `Printer` | Print barcode / labels |
| `notepad-edit` | `FilePenLine` | Bulk / customer info |
| `arrows-circle` | `RefreshCw` | Sync mockup |
| `delivery` | `Truck` | Buy labels / tracking |
| `courier` | `UserPlus` | Assign |
| `trash` | `Trash2` | Delete |
| `magnifier` | `Search` | Search fields |
| `cross` | `X` | Clear / close |
| `filter` | `SlidersHorizontal` | Apply filter |
| `category` | `LayoutGrid` | Product category |
| `loading` | `Loader2` (spin) | In-flight buttons |

## Module nav glyphs (already canonical in `readme.md` §5)

`LayoutDashboard` (Dashboard) · `Package` (Orders) · `Boxes` (Products/SKU/BOM) ·
`Warehouse` (Inventory) · `Ticket` (Tickets) · `Wallet` (Wallet) · `Truck`
(Tracking) · `BarChart3` (Reports) · `Settings` (Settings) · `Bell` · `Plus` ·
`SlidersHorizontal` · `Calendar` · `Printer` · `Upload`/`Download` · `Tag` ·
`ScanLine` (Fulfillment scan) · `MoreHorizontal` (Row actions) · `ChevronDown`.

## Rules that survive either icon set

- 16px inline (buttons, chips, cells) · 18–20px (icon buttons, nav, metric
  chips) · 22–24px (marketing feature cards). **Stroke stays 2px at every size.**
- Colours: `--icon-default` (navy-600) rest · `--icon-muted` (navy-400)
  secondary · `--icon-action` (Action Blue) in tinted chips + active ·
  `currentColor` inside buttons.
- Icon chips: tinted rounded square, 100-step background, 500/600-step glyph.
- **Never:** emoji as icons · filled+outline mixed in one view · duotone ·
  unicode arrows standing in for glyphs · one-off hand-drawn SVGs (the only
  inline SVGs allowed are the small primitives baked into components).
