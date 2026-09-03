# BE alignment — design system ⇄ attached backend (FE-build contract)

**Source:** attached local folder `fulfillment-system-be` (verified 2026-08-20).
This snapshot is **newer** than the `GWP-main/fulfillment-system-be-prod` tree the
system was originally audited against — migrations run through `20260722*`, and it
adds dashboard/billing report endpoints, ticket replies, customer notifications,
admin integration API, and the material/physical inventory stack. Verbatim payloads
and enums transcribed this pass live in `DOMAIN_RESOLVED.md` §6–§11.

**Rule for the FE build:** the design system (screens in `ui_kits/`, components,
`tokens/`, `status-tones.json`) is the visual source of truth; this file + `DOMAIN_RESOLVED.md`
are the data contract; `BACKEND_GAPS.md` is what must NOT be assumed.

---

## 1 · Vocabulary verdict — UNCHANGED, design system stays valid

Re-verified against `src/constants/common.ts`, `src/ticket/ticket.enum.ts`, `src/metadata/metadata.ts`:

- `ORDER_STATUS` — same 16 values. `Pending Dropoff` / `Design Sorted` still commented out; `Out Of Stock` still absent from the enum but present in `FULFILLED_STATUS` metadata. → `BACKEND_GAPS.md §C` stands as written.
- `USER_ROLE` — same 7 roles.
- `TicketStatus` (`open`/`in_progress`/`closed`) and `TICKET_REASON` (6 Vietnamese values, same reason→priority map) — unchanged. `TicketPriority` TS enum still lacks `CRITICAL`; metadata `TICKET_PRIORITY` still has 4 values incl. `critical`.
- `SHIPPING_TYPE` (`customer`="Ship by Platform" / `op`="Ship by OP"), `PAYMENT_METHOD` (Bank Transfer / Credit Card / Cash) — unchanged.

→ `StatusBadge`, `status-tones.json`, `NavUser.role` and every screen's status vocabulary need **no change**.

## 2 · Backend asks — status after this pass

| Ask | Status | Where |
|---|---|---|
| §6.1 Paginated transactions + type enum | **RESOLVED** — `GET /api/reports/billing/transactions` (`type`: `topup`\|`refund`\|`surcharge`\|`fulfillment`, `page`/`limit`, `meta.total_pages`) | DOMAIN_RESOLVED §7 |
| §5.1 TICKET_REASON enum | **RESOLVED** (previous pass, re-confirmed) | DOMAIN_RESOLVED §1 |
| §2.2 `tracking_status` enum | **PARTIAL** — no enum, but the BE normalizes to a working set `pre_transit` · `in_transit` · `delivered` · `unknown`, with raw carrier strings passing through | DOMAIN_RESOLVED §6 |
| §6.2 Balance model in writing | **PARTIAL** — `balance_before`/`balance_after` per transaction, `pending_deposit`, `debt`, `tier` now exposed; the written model still doesn't exist | DOMAIN_RESOLVED §7/§10 |
| §1.1–1.4 Admin dashboard fields | **OPEN for the browser FE.** `GET /admin/v1/reports/summary` (orders_by_status) and `/admin/v1/reports/orders-by-date` exist but sit behind `AdminApiKeyGuard` (`x-api-key`, integration surface) — not the session-auth admin UI. `GET /api/reports/customer-orders` is unchanged: still no `previous_summary`, `series`, status counts, on-time rate. | — |
| §2.1 Admin order summary, §2.3 asset flags, §2.4 role matrix, §3.x products, §4.x fulfillment ops | **OPEN** — unchanged | `BACKEND_ASKS.md` |

## 3 · New seller-facing contracts the FE binds to (per screen)

| Screen (visual truth) | Endpoint (data truth) | Notes |
|---|---|---|
| `seller-app/SellerDashboard.html` | `GET /api/reports/dashboard/overview` | `alerts{7}` + `summary{5}` + `daily[]` — DOMAIN_RESOLVED §8. Alert cards ignore the date filter (by design). |
| `seller-app/SellerCharts.html` | `GET /api/reports/dashboard/efficiency` | 4 cards; status groupings are server-side verbatim — §9 |
| `seller-app/SellerWallet.html` + `SellerWalletDrawer.html` | `GET /api/reports/billing/overview` · `…/billing/transactions` · `…/billing/spending-history` · `POST /api/billing/top-up` · `POST /api/billing/refund-request` | §10. "All transactions" is now buildable — drop the 6-row `recent_transactions` workaround. |
| `seller-app/SellerTickets.html` (thread drawer) | `GET /api/tickets/:id/detail` · `POST /api/tickets/:id/replies` | `TicketReply` + `File` models exist — the conversation UI is now backed. §11 |
| `seller-app/SellerOrders.html` | `GET /api/customer/orders` (+ `/orders/pricing`, `/orders/multi`) | columns/actions per role unchanged — DOMAIN_RESOLVED §2–§4 |
| `admin-app/AdminTransactions.html` | `GET/POST /api/transactions`, `:id/approve`, `:id/reject` | status written by BE: `pending` → `completed` / `rejected` (reads also check `failed`) |
| `admin-app/AdminExpenses.html` | `/api/expense-categories`, `/api/expense-entries` (+ `/summary`) | module confirmed real |
| `admin-app/AdminVendors.html` | `/api/vendors` CRUD | confirmed |
| `admin-app/AdminMaterials*.html`, `AdminBom*.html`, `AdminPhysical*.html` | `/api/materials`, `/api/material-items`, `/api/material-inventory(+/movements,/adjustments)`, `/api/material-stock-receipts` (+ approve/reject/evidence), `/api/boms*`, `/api/physical-variants`, `/api/physical-inventory`, `/api/physical-stock-receipts` | full stack exists; BOM quantities hazard (GAPS §E) stands |
| `admin-app/AdminNotifications.html`, `AdminUserChannels.html` | `/api/customer-notifications*`, `/api/users/:userId/contact-channels*` | confirmed real, incl. Telegram groups sync |
| `admin-app/AdminProductionOptions.html` | `/api/production-options`, `/api/techniques`, `/api/print-positions`, `/api/products/addon-rules` | vocab: `TECHNIQUE_TYPES`, `PRINT_POSITIONS`, `MATERIALS`, `ADDON_RULE_TYPES` in `metadata.ts` |
| `warehouse-app/*` | `GET /api/orders/warehouse-summary`, `/api/orders/fulfillment-scan-by-id/:id`, `/api/orders/warehouse/fullfillment` (sic) | scan-mutates-on-GET hazard (GAPS §D) stands |

## 4 · Hazards added this pass (FE must design around)

1. **`daily` / chart arrays are NOT zero-filled** (`dashboard/overview`, `billing/overview.charts`) — grouped from raw rows only. Per standing rule 3, do not zero-fill client-side to fake slope; render the points the API returns (gaps read as gaps).
2. **`tracking_status` can carry raw carrier text** — theme only the four normalized values; anything else renders as plain mono text.
3. **Billing card semantics are server-defined status groupings** — `paid` = Fulfilled+Completed, `pending` = Production Ready+In Production+Filled+Produced, `refunded` = Refund+Return, `wrong_label` = Wrong Label+Design problems. Label the cards with these exact meanings; never re-bucket client-side.
4. **`/admin/v1/*` is the integration API** (x-api-key + admin role), not the browser app's data source. The admin UI keeps using session-auth `/api/*` routes.
5. Everything in `BACKEND_GAPS.md §D` (V3 repricing, sticky manual cost, QC=Fulfilled, scan-on-GET, photo-forces-Fulfilled, `warehouse_id` is a user id) — re-confirmed present in this snapshot.
