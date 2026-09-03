<!-- Copy this file to FE-VN/CLAUDE.md -->

# GWP Fulfillment FE — working rules

React 18 + Vite + Tailwind v4 + TypeScript strict, pnpm workspace.
`apps/seller` · `apps/admin` (+ warehouse stations) · `apps/public` (last) ·
`packages/ds` · `packages/api`.

The **design system project is the source of truth** for how anything looks, and the
attached backend for what any of it means. Before writing a screen, read: its entry in
`handoff/routes.json`, its reference PNG in `screenshots/reference/`, its section of the
surface README, and `STATES.md`.

## Never
- Add a color, font, radius, or shadow outside `gwp.theme.css`. Regenerate it from
  `tokens.json`; never hand-edit, never inline a hex.
- Read `theme`/`color` from the backend's `metadata.ts` (`GET /api/metadata`) — dead
  pre-rebrand data. Status color comes only from `STATUS_TONES` / `--status-*`.
- Port anything from the old Metronic FE's look, or its `tokens.css` graphite theme.
  The old FE is a *contract* source (fields, routes, roles), never a visual one.
- Install a UI kit, a CSS-in-JS runtime, or any mock layer. Real backend from day one.
- Translate Vietnamese enum values (`TICKET_REASON`, `ORDER_STATUS`, warehouse route
  names) — they are data. Chrome language per `I18N.md`.
- Invent an order state, role, SKU/BOM rule, wallet semantic, price rule, or a number
  the API doesn't return. Ship the documented placeholder and log it in `BACKEND_ASKS.md`.
- Zero-fill chart series. Prefetch, retry, or double-fire the fulfillment scan call.

## Always
- Build screens from `packages/ds` components, never one-off markup.
- `draft → Apply` toolbars; filter state in the URL; query key from the applied filters.
- Loading / empty / error / no-permission for every data surface (`STATES.md`).
- Role gates read from `handoff/routes.json`, not a hand-written list.
- 1024px is the floor; nothing below it is designed yet.
- Run `VERIFY.md` against the reference PNG before calling a screen done.

Build order and per-phase acceptance criteria: `handoff/BUILD_PLAN.md`.
