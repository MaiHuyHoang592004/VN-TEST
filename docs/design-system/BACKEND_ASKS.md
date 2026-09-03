# Backend asks — what the design needs from the API

> **2026-08-20 reconciliation:** re-checked against the attached local backend
> `fulfillment-system-be` (newer than the repo snapshot). Resolved: **§5.1**,
> **§6.1**; partial: **§2.2**, **§6.2**. Full verdict table: `BE_ALIGNMENT.md`;
> verbatim payloads: `DOMAIN_RESOLVED.md` §6–§11. Rows below are marked inline.

Every screen in `ui_kits/` was built against the real frontend + backend source
(repo, branch and per-screen file map: `github.md`). Where a screen shows
something the API does not return yet, it is listed here — nowhere else. Nothing
in this file is a guess about business rules: each row says what the block needs
and, where a decision is required first, says that instead of assuming one.

Priority key: **P1** = a block is drawn and waiting on this · **P2** = removes a
client-side workaround · **P3** = unblocks a screen not yet built.

---

## 1 · Admin Dashboard — `GET /api/reports/customer-orders`

All four are **extra keys on the existing response**, so no new call and no new
client wiring. Screen: `ui_kits/admin-app/AdminDashboard.html`.

> 2026-08-20: still open for the browser FE. `/admin/v1/reports/summary` and
> `/admin/v1/reports/orders-by-date` exist but sit behind `AdminApiKeyGuard`
> (`x-api-key` integration surface) — not the session-auth admin UI. The
> session route `GET /api/reports/dashboard/overview` is **seller-scoped**.

| # | Pri | Field | Block it drives | Notes |
|---|---|---|---|---|
| 1.1 | P1 | `order_count_by_warehouse_status: { <ORDER_STATUS>: n }` | Production pipeline | **Cheapest of the four** — the seller report (`GET /api/reports/customer`) already returns this exact shape, so the admin report can compute it the same way. Keys must stay in the `ORDER_STATUS` vocabulary from `src/constants/common.ts`: never translated, never re-grouped into invented buckets. |
| 1.2 | P1 | `previous_summary { total_transactions, total_customers, total_orders, total_quantity, total_base_cost, total_topup }` | every delta chip (hero + 4 stat cards) | The same six figures for the **preceding range of equal length**. Same query, shifted dates. Do not let the client derive this — comparing two differently-sized ranges is how a dashboard starts lying. If this never ships, the chips come off. |
| 1.3 | P1 | `series: [{ date, order_count, quantity }]` | Orders over time (area chart) | One row per day inside the selected range, **zero-filled** for days with no orders (otherwise the curve invents slope). A dedicated `GET /api/reports/orders-by-day?start_date&end_date` is equally fine. |
| 1.4 | P2 | `on_time_rate` (0–1), `avg_days_to_ship` (days) | Fulfillment health, in the hero | **Needs a product decision before any SQL:** what starts the clock (order paid? label purchased?), what stops it (tracking accepted? delivered?), and what counts as on-time per `shipping_type`. Until that is agreed this is the one block to drop rather than approximate. |

Already live, nothing needed: `summary` (six figures) and `report[]`
(`customer_name`, `customer_email`, `total_orders`, `total_quantity`,
`total_base_cost`, `total_topups`, `customer_balance`, `customer_debt`).

## 2 · Admin Orders — `/orders`

| # | Pri | Ask | Why |
|---|---|---|---|
| 2.1 | P1 | An **admin-visible order summary** honouring the current filter — counts per `warehouse_status`, e.g. `GET /api/orders/summary?<same filter params>`. | `useWarehouseSummary` feeds a summary strip for `warehouse` / `warehouse_external` only. Admin sees every seller's orders and has no equivalent, so the screen currently shows no counts at all rather than invented ones. |
| 2.2 | ~~P1~~ **PARTIAL** | A documented **`tracking_status` enum**. | The BE now normalizes to `pre_transit` · `in_transit` · `delivered` · `unknown` (raw carrier strings pass through) — `StatusBadge` themes those four only. A formal enum is still the ask. See `DOMAIN_RESOLVED.md` §6. |
| 2.3 | P2 | `label_url` / `design` / `mockup` **readiness flags** as booleans (or a small `assets: { design, mockup, label }` object with `ok` / `missing` / `processing` / `error`). | The Assets column currently infers state from URL presence. A flag makes "Thiếu label" filtering server-side instead of per-page. |
| 2.4 | P3 | Per-role button visibility, or at least a documented matrix for `OrderActionButtons.jsx`. | Every admin action is shown because the gating is unread. This is a read, not necessarily a backend change — but if the rules live server-side, expose them. |

## 3 · Admin Products — `/products`

| # | Pri | Ask | Why |
|---|---|---|---|
| 3.1 | P2 | `variants_count` on the product list payload. | The Variants column needs a count without fetching every variant per row. |
| 3.2 | P2 | An explicit `v3` (or `has_production_config`) boolean. | The screen infers it from `configs.v3_matrix` being present, which is a shape check standing in for a flag. |
| 3.3 | P3 | The real filter set behind `ProductToolbar.jsx` (status, version, category?). | Filters are currently a plausible guess; the toolbar is drawn but the option lists are not confirmed. |

## 4 · Fulfillment Ops — `/fulfillment`, `/qc-dong-goi`

| # | Pri | Ask | Why |
|---|---|---|---|
| 4.1 | P2 | A permitted way to **set `basket_position`** from the station (endpoint + role). | The source's own copy says the field belongs to the product variant and the permission is not open to workers, so the Edit control ships disabled. |
| 4.2 | P3 | The **fuzzy / near-miss scan lookup** rules (USPS `420`-prefix stripping is in the frontend; the chooser behaviour is not). | The station currently does exact-match only, so a mis-scan dead-ends instead of offering candidates. |

## 5 · Tickets — `/tickets`

| # | Pri | Ask | Why |
|---|---|---|---|
| 5.1 | ~~P1~~ **RESOLVED** | The **`TICKET_REASON` enum** and its reason → priority mapping. | Read verbatim — `DOMAIN_RESOLVED.md` §1. Ticket **replies** are also real now (`POST /tickets/:id/replies`, §11). |

## 6 · Wallet / Transactions

| # | Pri | Ask | Why |
|---|---|---|---|
| 6.1 | ~~P1~~ **RESOLVED** | A **paginated transactions endpoint** (+ the official transaction-type enum). | `GET /api/reports/billing/transactions` — `type`: `topup`·`refund`·`surcharge`·`fulfillment`, `page`/`limit`, `meta.total_pages`. `DOMAIN_RESOLVED.md` §7. Drop the 6-row `recent_transactions` workaround. |
| 6.2 | ~~P2~~ **PARTIAL** | The **balance model**, in writing: what `balance` includes, whether `debt` is derived, and what a top-up does to both. | Transactions now expose `balance_before`/`balance_after`; billing overview exposes `debt`, `tier`, `pending_deposit` (§10). The written model still doesn't exist — keep labelling, never derive. |

## 7 · Auth & session (opened 2026-08-21 by the FE scaffold decision)

| # | Pri | Ask | Why |
|---|---|---|---|
| 7.1 | **P1** | Does `POST /api/users/login` issue a **refresh token**, and is there a refresh endpoint? | The FE currently stores the bearer token and treats any 401 as "log out". If a refresh exists, users get silently logged out mid-shift for no reason; if it doesn't, we must not build a refresh loop on a guess. `handoff/AUTH_AND_ROLES.md` §2. |
| 7.2 | P2 | Token **TTL** + the canonical endpoint that returns the current user (`roles`, `balance`, `configs`). | `AuthProvider` boots from a stored token and needs one confirmed "who am I" call; the source FE reads `currentUser.roles` but the endpoint behind it is unread. |
| 7.3 | P2 | A **currency code** on every money field (order base/ship cost, expenses, transactions, balance). | The kit renders `$` on order costs and `₫` on expenses purely because those screens' sources do. Without a returned currency the FE is hard-coding a business fact per screen. `handoff/APP_SCAFFOLD.md` §7. |
| 7.4 | P3 | A documented **403 body** (or any distinguishable signal) for role-gated routes. | Guards currently infer no-permission from the route's role array; a direct URL hit should be able to trust the server, not the client's copy of the matrix. |

---

## Standing rules this file exists to protect

1. **No invented business truth.** If a figure has no field, the block is dropped or the screen ships the empty container — it is never approximated client-side.
2. **Vocabulary comes from the enum.** `ORDER_STATUS`, `TicketStatus`, `TicketPriority` and `USER_ROLE` are used verbatim, never translated or re-grouped.
3. **Aggregates belong to the server.** Deltas, shares and rates are only shown when the API returns both sides of the comparison.
