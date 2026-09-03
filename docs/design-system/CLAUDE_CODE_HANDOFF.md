# CLAUDE CODE HANDOFF — GoodWoodPrint Fulfillment Design System

This project is the **source of truth** for building the real GWP Seller Fulfillment App, marketing site, and Product Catalog frontends. This file is the implementation entry point — read it before touching code, then follow its pointers into the deeper docs.

## What this repo is and isn't

Everything under `components/`, `ui_kits/`, `templates/` is a **working reference**, not a drop-in dependency. `.jsx` files here render inside this sandbox's own runtime (`_ds_bundle.js`, this project's React/Babel setup) — they are not meant to be imported as-is into the target codebase. Port their markup, styles (as literal token values or CSS custom properties), and prop contracts into the target stack's own component library and build system.

## Target codebase

**Location (2026-08-21): the FE is built in the attached local folder `FE-VN/`.** The paste-ready kickoff + per-screen prompts for the agent that builds it are in **`handoff/CLAUDE_CODE_PROMPT.md`**. Its scaffold, dependency pins, config, provider tree and formatting rules are locked in **`handoff/APP_SCAFFOLD.md`**; the network layer in **`handoff/API_CLIENT.md`**; session/roles/guards in **`handoff/AUTH_AND_ROLES.md`**; the PR-by-PR build order in **`handoff/BUILD_PLAN.md`**; and **`handoff/TARGET_CLAUDE.md`** is the `CLAUDE.md` to copy into `FE-VN/`. Read those four before writing code — they close every plumbing decision so nothing has to be guessed.

**DECIDED 2026-08-20: the FE is built NEW from scratch** — React 18 + Vite + **Tailwind v4** — not on the old Metronic frontend. The Metronic mapping table further down stays only as historical reference for reading the old FE's contracts (columns, routes, role gating); its "restyle Metronic components" advice no longer applies.

Build plan (all decided, don't re-ask):
- **Two apps:** `seller` (cream shell floating on sky, `TopNav`) and `admin` (white ground, `TopNav variant="bar" surface="white"`) — the warehouse workstations (scan/QC, `AdminBar` chrome) live **inside the admin app**.
- **Order:** seller app first, **all 14 seller screens** (`ui_kits/seller-app/`), starting with **login** (`ui_kits/system/SystemAuth.html`, `POST /api/users/login`, bearer token) → then nav order Dashboard → Orders → Tickets → Catalog → Tích hợp.
- **Data:** wire the **real backend from day one** — endpoints per screen in `BE_ALIGNMENT.md` §3; no MSW/mock layer.
- **Tokens:** import `handoff/gwp.theme.css` (generated from `tokens.json`; 238 tokens, Tailwind v4 `@theme inline`) — utilities like `bg-sky-300`, `text-navy-700`, `text-status-critical-fg` exist immediately. Regenerate from `tokens.json` when tokens change; never hand-add colors.
- **Data grid:** engine is implementer's choice (TanStack Table recommended) — must reproduce `DataTable`'s look: horizontal row rules only, no vertical grid, no grey header fill, `surface="field"` frameless variant, 56/48px rows.
- **Verification:** run `VERIFY.md` after every screen; reference PNGs in `screenshots/reference/`.

Read `github.md` for the original source repo (routes, role permissions, field names, status vocabulary, copy) — it reads as contract; never invent what it doesn't confirm.

## ⚠ Sources that WILL mislead you — never read these for styling

1. **Backend `src/metadata/metadata.ts` `theme`/`color` hex literals** (`FULFILLED_STATUS`, `TICKET_PRIORITY`) — served via `GET /api/metadata`. They are the pre-rebrand pastel palette. Status rendering uses **only** `STATUS_TONES` / `--status-*` tokens; treat the API's `theme`/`color` keys as dead data.
2. **Old FE `tokens.css`** — the graphite "austere console" theme (Space Grotesk, oklch greys). Contradicts the approved direction on every axis. Never port, never merge.
3. **Metronic "demo1" chrome and defaults** — dark sidebar, grey table headers, card-in-card, its color scale, KeenIcons duotone. All of it is the "Generic SaaS drift" failure mode (`readme.md` §8). The old FE is a *contract* source (what fields, what routes, what roles), never a *visual* source.
4. **Vietnamese enum values are data, not chrome** — never translate `TICKET_REASON`, `ORDER_STATUS`, warehouse route names (`I18N.md`).

## Implementation order

1. **Tokens first.** `tokens.json` (project root) is the canonical, machine-readable export of every value in `tokens/*.css` — colors (canonical anchors + derived ramps + status tones), typography, spacing, radius, shadow, motion, surfaces. Port these into the target codebase's token layer. The frontend's existing `tokens.css` is a pre-rebrand "graphite" theme (Space Grotesk, oklch greys, no shadows) and must be **replaced**, not merged. Load Baloo 2 / Nunito Sans / IBM Plex Mono via `tokens/fonts.css`'s Google Fonts import.
2. **Primitives before composites.** Build `components/core`, `components/forms`, `components/navigation`, `components/data` before `catalog`, `marketing`, `feedback`. For each: `<Name>.jsx` is the reference implementation, `<Name>.d.ts` is the prop contract (including any DOMAIN-BOUND annotations), `<Name>.prompt.md` is when/how to use it and what not to do with it.
3. **Screens last**, in nav order (`ui_kits/seller-app/README.md` "Dãy nav" table): Dashboard → Orders → Products → Product Detail → Wallet → Support → Charts. Each screen's `.html` is the pixel-and-behavior reference; the matching section of `ui_kits/seller-app/README.md` is its written contract — exact source fields, what's confirmed vs DOMAIN-BOUND vs deliberately not built, and why. That README is the single most detailed file in this project — read the relevant section fully before writing a line of the real screen.

## Non-negotiables

- The four rules in `SKILL.md`.
- The two failure modes in `readme.md` §8 (Generic SaaS drift, L!M imitation) — if a screen would look at home in any other admin product, it is wrong.
- The business boundary in `readme.md` §1: never invent order states, roles, SKU/BOM rules, wallet/accounting semantics, production or shipping lifecycles, personalization flow, or pricing rules. Ship the empty container and mark it DOMAIN-BOUND, exactly as the existing components do.

## Resolved decisions

`guidelines/ALIGNMENT_AUDIT.md` § RESOLUTIONS closes all six previously-open decisions: token canonicity, status-colour source of truth, the Vietnamese display-type substitute, ratings, brand spelling, and cream-on-sky contrast. Build against the resolutions, not the older "DECISIONS REQUIRED" list above them in the same file.

## Machine-readable import aids (added for AI import — read these first)

These exist so an import doesn't have to parse 55 screen HTML files to recover intent:

- **`handoff/routes.json`** — the flat route table derived from the manifest: 49 routes, each with `app` (seller/admin/public), `routePath`, `siblingPaths`, `roles`, `shell`, `reachedVia`, `featureFlag`, `components`, `domainBound` — plus 8 `nonRoutable` screens that must NOT be given invented paths. Route guards and nav filtering read their role arrays from here, not from a hand-written list.
- **`ui_kits/screen-manifest.json`** — the route→screen→component contract. One entry per screen: `route`, `roles`, `shell`, `source` file(s), the exact design-system `components` that screen mounts, and its `domainBound` list. Start here to know what to build and what each screen depends on.
- **`DOMAIN_RESOLVED.md`** — source values previously marked DOMAIN-BOUND, now read verbatim: `TICKET_REASON`→priority, order columns/actions/form-fields per role, the product filter. Wire these; don't guess them.
- **`STATES.md`** — the loading / empty / error / no-permission / disabled matrix per surface, each mapped to the component that renders it and the real gate that triggers it.
- **`RESPONSIVE.md`** — breakpoints and per-surface behaviour below the 1024px kit floor. Says explicitly what is *not* yet designed so you don't invent it.
- **`I18N.md`** — which surface's chrome is English vs Vietnamese, and the enum values that must never be translated.
- **`ICONS.md`** — the icon-set decision (ship Lucide) + the KeenIcon→Lucide map.
- **`BACKEND_ASKS.md`** — fields a screen is drawn against but the API doesn't return yet.
- **`BE_ALIGNMENT.md`** — the design↔backend reconciliation (2026-08-20, against the attached `fulfillment-system-be`): which asks are now RESOLVED (paginated billing transactions + type enum, dashboard overview/efficiency, ticket replies, normalized `tracking_status` set), the **per-screen endpoint map** (§3) every FE data layer binds to, and the new hazards (charts not zero-filled, server-defined billing buckets, `/admin/v1/*` is x-api-key integration only).
- **`VERIFY.md`** — the measurable definition of "matches the design": render reference vs build, pixel diff, and the per-screen token/type/layout/state checklist. Run it after porting every screen.
- **`handoff/gwp.theme.css`** — tokens.json compiled to a Tailwind v4 `@theme inline` sheet (fonts import + all 238 tokens + 163 utility mappings). The new FE's single styling entry point.
- **`screenshots/reference/`** — per-screen reference PNGs at 1440px (primary + key secondary states). Claude Code cannot render the `ui_kits/` HTML — these are how it *sees* the target.
- **`BACKEND_GAPS.md`** — the full backend risk register: missing fields/endpoints, vocabulary with no enum (`tracking_status`), statuses live in FE but never written by BE, behavioural hazards (V3 repricing, QC has no state, scan-mutates-on-GET), and models left as placeholders.
- **`types/domain.d.ts`** — the real payload shapes (Order, Ticket, Product, User, Transaction, BOM, …) + enum unions, derived verbatim from `schema.prisma` + `metadata.ts`. Manifest says *which* components a screen uses; this says *what data* it binds.
- **`components/fixtures.json`** — minimal-valid sample props per component (real enum values) for render smoke-tests.
- **`A11Y.md`** — per-component accessibility contract (role, keyboard, focus, labelling) + a per-screen verify checklist.
- **`examples/golden-path/`** — one screen (`/variants`) ported for real into the target stack (React + TS + Tailwind + tokens) as a before/after pattern.
- **`SYNC.md`** — the unattended repo→design-system sync run-through (incl. the token-coverage check script).

## Component → target FE mapping

The target is the real GWP frontend: React 18 + Vite + Tailwind + Metronic "demo1". Port, don't import (`.jsx` here runs in this sandbox only). Suggested landing spots:

| This system | Target codebase |
|---|---|
| `tokens/*.css` | **Replace** `src/tokens.css` (the pre-rebrand graphite theme) with these; load fonts via `tokens/fonts.css`. |
| `core`, `forms`, `data`, `navigation`, `feedback`, `brand` | A new `src/components/ds/*` shared library. Where Metronic already ships an equivalent (`@/components/ui/select`, `ui/input`), restyle *that* to the token contract rather than adding a parallel one. |
| `DataTable` | The screens use Metronic's `useDataGrid`; keep the grid engine, reskin to `DataTable`'s row-rule-only / frameless-field look. |
| `StatusBadge` (+ `STATUS_TONES`) | Central status renderer. Feed it `ORDER_STATUS`/`TICKET_*` values; never the backend `metadata.ts` theme/color literals. |
| Icons (`KeenIcon`) | Swap to Lucide per `ICONS.md` (or keep KeenIcons if licensed — same names, same rules). |
| `ui_kits/*/*.html` screens | `src/pages/*` per the `github.md` **Screen map** and `screen-manifest.json` `source` field. |

## Domain bindings — don't assume past what's verified

`readme.md` "Domain boundaries" table plus each component's `.d.ts` DOMAIN-BOUND block are authoritative. When a screen's README section flags a field "CHƯA XÁC NHẬN" / unconfirmed (e.g. personalization fields, ticket thread shape, SKU/BOM construction, the price-tier threshold rule), keep it unconfirmed and visibly placeholder in the real implementation too — don't silently promote it to real behavior because it "probably works that way."

## Definition of done, per screen

- [ ] Matches the reference `.html` from 1024px up (the kit's floor — `TopNav` has no collapse behavior below it yet).
- [ ] Built from ported components (nav, buttons, badges, cards, tables), not one-off markup.
- [ ] Sky-as-page / cream-in-doses / at least one Craft Cut rhythm survives porting — not flattened to a white page.
- [ ] Status colours come from the `STATUS_TONES` map, never backend `metadata.ts` theme/color literals (RESOLUTIONS #2).
- [ ] Every DOMAIN-BOUND field is either wired to a confirmed real field or left as the documented placeholder — never fabricated.
- [ ] Clears the contrast floor in `readme.md` §7 — no text lighter than navy-500 on a light ground, no opacity-based de-emphasis on small text.
- [ ] Focus rings intact; `prefers-reduced-motion` disables the named keyframes.

## Files that matter most, in reading order

1. `SKILL.md` — the four rules, one page.
2. `readme.md` — the full rulebook (voice, color duties, type, motifs, accessibility floor, the two failure modes).
3. `ui_kits/screen-manifest.json` — route→screen→component contract, machine-readable.
4. `github.md` — source repo pointer + per-screen file citations.
5. `ui_kits/seller-app/README.md` — the detailed per-screen contract. Longest, most load-bearing file in the project.
6. `DOMAIN_RESOLVED.md` · `BE_ALIGNMENT.md` · `STATES.md` · `RESPONSIVE.md` · `I18N.md` · `ICONS.md` · `BACKEND_ASKS.md` · `VERIFY.md` — the import aids above.
7. `tokens.json` — canonical tokens, flat and machine-readable.
8. `guidelines/ALIGNMENT_AUDIT.md` — what changed, why, and the final resolutions.
9. `components/**/*.d.ts` + `.prompt.md` — per-component contract and domain boundary.

## What's still missing (don't assume these exist)

*(Updated 2026-08-20 — the kit now spans ~60 screens: `seller-app/`, `admin-app/` incl. BOM/materials/physical-inventory/expenses/vendors/notifications, `marketing/`, `warehouse-app/`, `system/`. The earlier gap list is obsolete.)* Still without design coverage: the full `OrderModal` validator set and `OrderDetailsDrawer` deep shape (sections read, not every rule), the label-extractor workbench internals, `ProfilePage` info-card bodies, and anything listed in `BACKEND_GAPS.md` §E. Per-screen gaps: `ui_kits/screen-manifest.json` → `domainBound`.
