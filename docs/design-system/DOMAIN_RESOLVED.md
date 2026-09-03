# Domain-bound items RESOLVED this pass

Read directly from the source repo (`github.md` → `MaiHuyHoang592004/GWP@main`);
§6–§11 read from the **attached local backend** `fulfillment-system-be` (2026-08-20,
newer than the repo snapshot — see `BE_ALIGNMENT.md`).
These were previously marked DOMAIN-BOUND / "unread"; the exact source is now
transcribed here **verbatim** so an AI import wires the real vocabulary, not a
guess. Nothing here is invented — every value is quoted from the file cited.

> Vocabulary rule still holds: use these strings exactly, never translated or
> re-grouped. Where a value is Vietnamese it stays Vietnamese (it is a data
> value, not UI chrome — see `I18N.md`).

---

## 1 · TICKET_REASON → priority (RESOLVES SellerTickets + AdminTickets)

Source: `fulfillment-system-be-prod/src/metadata/metadata.ts` → `TICKET_REASON`
(served to the FE via `metadata.service.ts` as `ticket_reason`). Priority is
**auto-assigned from reason and read-only** in the UI (the source's Priority
select is `disabled`). Six entries, all Vietnamese values:

| # | `value` / `name` (verbatim) | `priority` |
|---|---|---|
| 1 | `Warehouse giao nhầm đơn` | `high` |
| 2 | `Khách trả hàng do chất lượng` | `critical` |
| 3 | `Tạo label sai/thiếu địa chỉ` | `low` |
| 4 | `Khách đưa sai địa chỉ` | `critical` |
| 5 | `Giao thiếu mũ` | `low` |
| 6 | `Lý do khác` | `medium` |

`TICKET_PRIORITY` (same file) has **four** values — `low` · `medium` · `high` ·
`critical` — confirming `critical` is real (readme previously noted it only "in
metadata"). Map all four onto `StatusBadge` tones: low→success, medium→info,
high→pending, critical→critical. `TICKET_STATUS`: `open` · `in_progress` ·
`closed`. `TICKET_SCHEMA` requires `displayName`, `priority`, `reason`;
`orderId`, `image`, `description` are commented optional.

---

## 2 · Order columns per role (RESOLVES AdminOrders / SellerOrders / warehouse)

Source: `fulfillment-fe-new-prod/src/pages/orders/constants.js`. Column order is
significant — render in this order. `//`-commented entries are **excluded** in
source; they are omitted below.

- **ADMIN_COLUMNS:** order_date · warehouse_status · tracking_status · tracking_number · order_id · quantity · product · variant · shipping_name · shipping_address · shipping_address_line_2 · shipping_zipcode · note · mockup_thumbnails · label_url · marketplace · order_image · fulfilled_at · base_cost · shipping_cost · shipping_type · seller · warehouse_note
- **CUSTOMER_COLUMNS:** order_date · warehouse_status · tracking_status · tracking_number · order_id · quantity · product · variant · base_cost · shipping_cost · shipping_name · shipping_address · shipping_address_line_2 · shipping_zipcode · note · mockup_thumbnails · label_url · marketplace · shipping_type  *(no seller, no fulfilled_at)*
- **WAREHOUSE_COLUMNS:** assigned_at · barcode · warehouse_status · tracking_number · order_id · quantity · product · variant · shipping_name · shipping_zipcode · mockup_thumbnails · label_url · marketplace · order_image · fulfilled_at · basket_position · warehouse_note · shipping_type  *(adds barcode + basket_position; drops address, note, costs)*
- **WAREHOUSE_EXTERNAL_COLUMNS:** = WAREHOUSE_COLUMNS (spread, identical).
- **WAREHOUSE_ADMIN_COLUMNS:** assigned_at · order_date · warehouse_status · tracking_number · order_id · quantity · product · variant · shipping_name · shipping_address · shipping_address_line_2 · shipping_zipcode · note · mockup_thumbnails · label_url · marketplace · order_image · fulfilled_at · seller · shipping_type
- **DESIGNER_COLUMNS:** order_date · warehouse_status · tracking_status · tracking_number · order_id · quantity · product · variant · shipping_name · shipping_address · shipping_address_line_2 · shipping_zipcode · note · mockup_thumbnails · label_url · marketplace · order_image · fulfilled_at · shipping_type · warehouse_note

## 3 · Order row/toolbar actions per role (RESOLVES OrderActionButtons)

Source: `pages/orders/blocks/components/OrderActionButtons.jsx`. Toolbar button
sets by role (verbatim ids). `designer` and `warehouse_external` get **no**
toolbar buttons.

- **admin:** add · import · download-template · download-label · backfill-design-previews · export · bulk-info-customer · bulk-sync-mockup · bulk-buy-labels · bulk · assign · delete
- **warehouse_admin:** add · import · download-template · download-label · backfill-design-previews · export · bulk-info-customer · bulk-buy-labels · bulk · assign · delete  *(no bulk-sync-mockup)*
- **warehouse:** add · import · download-template · download-label · print-barcode · bulk-info-customer · bulk
- **customer:** add · import · download-template · bulk-info-customer · export
- **warehouse_external:** *(none)*
- **designer:** *(none)*

`bulk-*` buttons appear only when ≥1 row is selected (animated reveal in
source). Per-row action gating (`ADMIN_ACTIONS` etc. from `constants.js`):
admin = refund·edit·upload_image·upload_mockup·update_info_customer·sync_mockup·recalculate·delete·assign;
customer = edit·update_info_customer; warehouse = edit·update_info_customer;
warehouse_external = edit; warehouse_admin = edit·update_info_customer·upload_mockup·assign·delete;
supporter = edit·update_info_customer·upload_mockup·delete·assign; designer = (none).

## 4 · Order form fields per role (RESOLVES AdminOrderModal)

Source: `constants.js` (`ADMIN_FORM_FIELDS` etc.). Field order significant.

- **admin/warehouse_admin:** the full set — product·variant·quantity · warehouse_status·tracking_status · order_id·marketplace·seller · tracking_number · shipping_name·shipping_email·shipping_company · shipping_address·…·shipping_country · shipping_type · design·mockup·label_url · base_cost·shipping_cost · note·warehouse_note.
- **customer:** the full set **minus** `base_cost`, `shipping_cost`, `seller`, `warehouse_status`, `tracking_status`, `warehouse_note`.
- **warehouse:** `warehouse_note` + `warehouse_status` only.
- **designer:** product·variant·quantity · warehouse_status · order_id · tracking_number only.

`design` + `mockup` are required on create for admin/warehouse_admin/customer.
`base_cost`/`shipping_cost` present in a request suppress auto-repricing
(manual-override, UBR-010). SHIPPING_TYPE enum: `customer`="Ship by Platform" ·
`op`="Ship by OP".

## 5 · Product list filter (RESOLVES AdminProducts)

Source: `pages/products/blocks/components/product-table/ProductToolbar.jsx`. The
toolbar is **search + one status select + Apply** — nothing more (no version or
category filter, despite `ProductColumns` showing a category icon):

- Search input, placeholder **"Search product"**, submits on Enter.
- Status `Select`: **All status** (`all`) · **Active** (`active`) · **Inactive** (`inactive`).
- An explicit **Apply** button commits both filters (`KeenIcon "filter"`).

---

## 6 · `tracking_status` working vocabulary (PARTIAL — still no enum)

Source: attached `fulfillment-system-be/src/webhook/webhook.service.ts` (KiloShips
status normalization) + `report.service.ts` queries. The BE normalizes carrier
statuses to **`delivered` · `in_transit` · `pre_transit`**, falling back to
`rawStatus?.trim() || 'unknown'` — so raw carrier strings CAN pass through.
Reports query `tracking_status IN ('pre_transit','in_transit')` and `delivered`.
→ `StatusBadge` may theme exactly these four; any other value renders plain text.

## 7 · Transaction type / status / payload (RESOLVES SellerWallet, AdminTransactions)

Source: `report.controller.ts` (`GET /reports/billing/transactions`) + `transaction.service.ts`.

- `type` enum (ApiQuery, verbatim): `topup` · `refund` · `surcharge` · `fulfillment`.
- `status` written by BE: `pending` (create) → `completed` (approve) / `rejected` (reject); reads also branch on `failed`. `reason_rejected` is returned **only** when status ∈ {`failed`,`rejected`} (falls back to `description`).
- Row shape: `created_at` · `transaction_id` · `type` · `payment_method` · `note` · `reason_rejected` · `amount` (number) · `status` · `balance_before` · `balance_after` (nullable numbers) · `metadata`. Pagination: `meta { total, page, limit, total_pages }`, default `limit=20`.
- Refund request is blocked when order status ∈ {`Refund`, `Cancel`}; approving a refund sets the order to `Refund`.

## 8 · Seller dashboard overview (RESOLVES SellerDashboard alerts/summary/chart)

Source: `GET /api/reports/dashboard/overview?start_date&end_date` → `report.service.getDashboardOverview`. Returns exactly:

- `alerts { required_topup, incomplete_art, production_ready, wrong_label, tracking_alerts, unread_tickets, design_problems }` — counts/amounts, **NOT date-filtered** (always current state; `required_topup` = `max(0, user.debt)`; `tracking_alerts` = pre/in-transit > 7 days via `fulfilled_at` fallback `order_date`).
- `summary { total_orders, total_products, spending, fee, avg_spending_per_order }` — date-filtered on `order_date`; `spending` = base_cost + shipping_cost.
- `daily [ { date: 'YYYY-MM-DD', orders, spending } ]` — grouped app-side, **not zero-filled**.

## 9 · Efficiency dashboard status groupings (RESOLVES SellerCharts)

Source: `GET /api/reports/dashboard/efficiency` + constants at top of `report.service.ts` (verbatim):

- `TERMINAL_STATUSES` = Fulfilled · Completed · Cancel · Return · Refund
- `IN_PROCESS_STATUSES` = Production Ready · In Production · Filled · Produced *(Pending Dropoff / Design Sorted commented out here too)*
- `OTHER_STATUSES` = Design problems · Wrong Label · Cancel · Return · Refund
- `PAID_STATUSES` = Fulfilled · Completed · `REFUND_STATUSES` = Refund · Return · `ERROR_STATUSES` = Wrong Label · Design problems
- `SHIPMENT_OVERDUE_DAYS` = 7. Cards: Order (orders/units/revenue) · Fulfilled+InProcess+Tickets · Production (Produced/In Production/Others/Overdue) · Shipping (Pre-Transit/In-Transit/Delivered/Overdue).

## 10 · Billing overview & spending history (RESOLVES SellerWallet)

Source: `GET /api/reports/billing/overview` · `…/billing/spending-history` · `POST /api/billing/top-up` · `POST /api/billing/refund-request`.

- Overview: `fulfillment_cost { paid, pending, refunded, wrong_label }` · `transaction_fees { paid, pending }` (groupings per §9) · `account { tier, current_balance, debt }` · `credit { current_balance, pending_deposit }` · `charts { spending_vs_revenue: [{date, revenue, spending}], wallet_flow: [{date, balance}] }` (from `balance_after`; not zero-filled).
- Spending history: `data [ { month: 'YYYY-MM', order_count, spending, fee, total } ]` + same `meta` pagination, default `limit=12`, grouped on `created_at`.
- Order now carries `revenue` and `fee` fields (schema).

## 11 · Ticket replies (RESOLVES the SellerTickets/AdminTickets thread)

Source: `ticket.controller.ts` + `schema.prisma` (`TicketReply`, `File` models — migration `20260412000000_add_file_and_ticket_reply`). Endpoints: `POST /api/tickets` · `GET /api/tickets` · `GET /api/tickets/:id/detail` · `GET /api/tickets/:id` · `POST /api/tickets/:id/replies` · `PUT /api/tickets/:id` · `DELETE /api/tickets/:id`. File upload: `POST /api/files/upload`. The conversation drawer is now a real contract, not a placeholder.

---

## Still unread (remain DOMAIN-BOUND)

`blocks/label_extractor/*` extraction UI · the 32KB
`blocks/fulfillment/Fulfillment.jsx` legacy layout · `OrderModal.jsx` full
schema (sections read, not every field validator) · `ProfilePage` info-card
bodies · the balance/debt model · `tracking_status` enum (does not exist).
These stay placeholder per the business boundary.
