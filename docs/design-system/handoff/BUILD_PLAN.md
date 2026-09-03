# Build plan — PR-sized steps for Claude Code

Run top to bottom in `FE-VN/`. Each step is one PR: it must build, typecheck, and lint
clean before the next starts. Read `handoff/APP_SCAFFOLD.md` once first; per screen, read
its `handoff/routes.json` entry + its README section + `STATES.md` before writing code.

**Standing acceptance criteria (every screen PR):** the "Definition of done" list in
`CLAUDE_CODE_HANDOFF.md`, plus `VERIFY.md` run against `screenshots/reference/`.

---

## Phase 0 — scaffold (1 PR)

Workspace, both app entries, tsconfig, `app.css` + `gwp.theme.css`, provider tree,
`.env.example`, `CLAUDE.md`.
**Done when:** both apps boot to a token-styled placeholder — `bg-sky-300`, `font-display`
Baloo 2, and `text-status-critical-fg` all resolve; zero hard-coded hex anywhere.

## Phase 1 — `packages/ds` primitives (3 PRs)

1a `core` + `forms` · 1b `navigation` + `data` (incl. `DataTable` on TanStack Table) ·
1c `feedback`.
**Done when:** every component renders from `components/fixtures.json` props; `DataTable`
shows horizontal row rules only — no vertical grid, no grey header fill, 56/48px rows;
`StatusBadge` tones come only from `STATUS_TONES`; `A11Y.md` contract met per component.

## Phase 2 — `packages/api` + auth (1 PR)

`client.ts`, `toPaginated`, `format.ts`, `domain.ts`, `AuthProvider`, guards,
`/auth/*` + `/error/*` in **both** apps.
**Done when:** a real login against the real backend lands on the role's front door;
401 logs out; `/error/403|404|500` render; a wrong-app login redirects.

## Phase 3 — seller app, 14 screens (≈6 PRs)

Nav order, each PR a coherent group:
3a `/` Dashboard + Wallet drawer · 3b `/orders` (the biggest screen — URL filter state,
density, virtual scroll, polling) · 3c `/tickets` · 3d `/product-catalog` + product detail ·
3e `/tts-shops` + `/tts-orders` + both modals · 3f `/profile` + `/api-keys`.
**Done when:** every screen is wired to its `BE_ALIGNMENT.md` §3 endpoint, no mock;
`domainBound` fields still visibly placeholder; sky/cream rhythm intact.

## Phase 4 — admin app, 29 screens (≈10 PRs)

4a `/` Dashboard · 4b `/orders` + drawer + modal · 4c `/tickets` · 4d Products group
(`/products`, `/products/variants/:id`, `/variants`, `/production-options`, `/mockups`) ·
4e Inventory group (`/materials`, `/material-inventory`, `/physical-inventory`,
`/physical-variants`, `/boms/*`) · 4f `/users` + `/users/update-price/:id` + channels modal
+ price drawer · 4g `/transactions` + `/expenses` + `/vendors` · 4h `/warehouses` +
`/customer-notifications` (4 tabs) · 4i `/label-extractor` · 4j nav polish: 6 TopNav tabs,
3 dropdown parents, active-pill highlight incl. dropdown parents.
**Done when:** every route in `routes.json` with `app:"admin"` is reachable from the nav
by at least one permitted role; feature-flagged routes hide route **and** nav together.

## Phase 5 — warehouse stations, 6 screens (2 PRs)

`/fulfillment`, `/fulfillment-2`, `/fulfillment-new`, `/fulfillment-scan`, `/quick-scan`,
`/production-pipeline` — `AdminBar` chrome, inside the admin app.
**Done when:** scan is a mutation with `retry:0` and cannot fire twice (hazard §5.2);
`warehouse_external` sees only `/fulfillment-new`.

## Phase 6 — public app, 4 screens (2 PRs)

`apps/public`: marketing pages + `/product-catalog` + `/product-catalog/:id`, unauthenticated.

---

## Order of precedence when sources disagree

1. `readme.md` + `SKILL.md` (visual law) → 2. the screen HTML + its README section →
3. `handoff/routes.json` / `screen-manifest.json` → 4. `BE_ALIGNMENT.md` / `types/domain.d.ts` →
5. the old FE (contract only, never visual) → 6. nothing else. The backend's
`metadata.ts` theme/color literals are **never** a source.

## Stop and ask instead of guessing

A field with no endpoint · a status no action can legitimately set · a role gate the manifest
doesn't state · a currency the API doesn't return · any screen below 1024px (`RESPONSIVE.md`
says what is undesigned). Log it in `BACKEND_ASKS.md` and ship the documented placeholder.
