# Backend gaps & hazards

> **2026-08-20:** re-verified against the attached local backend
> `fulfillment-system-be` (newer snapshot). Wallet row in §A resolved; §B
> `tracking_status` updated; §C and every §D hazard re-confirmed present.
> Reconciliation + FE-build endpoint map: `BE_ALIGNMENT.md`.

A single map of everywhere the **backend is missing, ambiguous, or behaves in a
way the FE must not assume around**. This is the risk register; the actionable
field/endpoint *requests* live in `BACKEND_ASKS.md` (linked per row). Nothing
here is invented — each item cites the source read. Rule when porting: where the
backend has no truth, ship the empty container or the documented placeholder,
never a client-side guess.

---

## A · Fields / endpoints the API does not return yet

Drawn against but not provided — full detail and priority in **`BACKEND_ASKS.md`**:

| Area | Missing | Ref |
|---|---|---|
| Admin Dashboard | `previous_summary` (deltas), `series` (orders/day), `order_count_by_warehouse_status`, `on_time_rate`/`avg_days_to_ship` | ASKS §1 |
| Admin Orders | admin order-summary endpoint honouring filters; asset readiness flags | ASKS §2 |
| Admin Products | `variants_count`, explicit `v3`/`has_production_config` flag | ASKS §3 |
| Fulfillment Ops | permitted way to set `basket_position`; fuzzy scan lookup rules | ASKS §4 |
| Wallet | ~~missing~~ **RESOLVED** — `GET /api/reports/billing/transactions` (paginated, typed) + `billing/overview` + `billing/spending-history` | `DOMAIN_RESOLVED.md` §7/§10 |

## B · Vocabulary that has no enum

- **`tracking_status`** — still no formal enum, but the BE normalizes carrier
  updates to `pre_transit` · `in_transit` · `delivered` · `unknown`, and **raw
  carrier strings pass through** the fallback. `StatusBadge` may theme exactly
  those four; any other value renders plain mono text. Never assume it mirrors
  `ORDER_STATUS`. (`DOMAIN_RESOLVED.md` §6.)
- **Balance / debt model** — what `balance` includes, whether `debt` is derived,
  what a top-up does to both, is not written down. Label exactly what the API
  returns; never sum or derive. (`readme.md` Domain boundaries; ASKS §6.2.)

## C · Statuses live in the FE but never written by the backend

From `metadata.ts` (`FULFILLED_STATUS`, served to the FE) vs
`constants/common.ts` (`ORDER_STATUS`, the real enum), audit UBR-014/015:

- **`Pending Dropoff`** and **`Design Sorted`** — commented out of the backend
  enum and every BE consumer, but **still live in `FULFILLED_STATUS`** and still
  string-matched by ≥3 FE pages (Attention tab, overwrite modals). No BE path
  writes them today.
- **`Out Of Stock`** — in `FULFILLED_STATUS` and the Attention-tab filter, but
  **not in `ORDER_STATUS` at all**, and no BE write found.

→ For import: render these three if a row somehow carries them (historical rows /
raw edits), but do **not** build flows that produce them, and don't treat the
Attention-tab filters for them as reachable without confirmation.

## D · Behavioural hazards (real code, business intent UNKNOWN)

The FE must design around these; do not "fix" or assume:

- **V3 order repricing drops the option delta** (UBR-009). Any generic order
  edit reprices through the V2 service, which can't see a V3 order's
  production-option delta → the price silently falls back to bare
  product/variant pricing. Don't build a UI that implies edit-safe V3 pricing.
- **Manual cost is sticky-by-presence** (UBR-010). Sending *any* `base_cost`/
  `shipping_cost` (even `0`, even unchanged) suppresses auto-repricing for that
  request; a later edit omitting them silently re-enables it. There is no
  explicit override flag to bind a toggle to.
- **QC has no distinct backend state** (UBR-022). `/qc-dong-goi` and
  `/fulfillment` are the same component + endpoint; a QC photo forces `Fulfilled`
  exactly like a check photo. "QC passed" is not a state you can show.
- **Scan lookup mutates on GET** (UBR-013). `fulfillment-scan-by-id` writes state
  on read; >20 orders trips a `requires_confirmation` gate. Treat the scan as a
  write action in the UI, not an idempotent lookup.
- **Photo upload forces `Fulfilled` from any status** (cross-ref, audit). A proof
  photo is a state transition, not an attachment.
- **`warehouse_id` on an order is a User id, not a Warehouse id** (UBR-016).
  "Assigned to warehouse X" points at a warehouse-role *user account*. Don't
  render it as a location entity.
- **Chart arrays are not zero-filled** (`dashboard/overview.daily`,
  `billing/overview.charts.*`) — grouped app-side from raw rows. Render the
  points returned; never zero-fill client-side to fake slope (standing rule 3).
- **Billing card buckets are server-defined status groupings** — `paid` =
  Fulfilled+Completed, `pending` = the four in-process statuses, `refunded` =
  Refund+Return, `wrong_label` = Wrong Label+Design problems (`DOMAIN_RESOLVED.md`
  §9). Label with these meanings; never re-bucket client-side.
- **`/admin/v1/*` is the integration API** (`x-api-key` + admin role), not the
  browser app's data source — the admin UI stays on session-auth `/api/*`.
- **`warehouse_external` with no `configs.products`** is fail-closed to an empty
  list (UBR-017) — show `EmptyState`, not an error.

## E · Models / files not read → stay placeholder

- **BOM component quantities** — `BOM.csv` ships every quantity empty and the
  seed defaults each to `1` (UBR-001/002); live inventory math runs on those
  defaults. Don't present BOM consumption numbers as authoritative.
- **Label-extraction UI** (`blocks/label_extractor/*`) — not read; the
  workbench is a documented placeholder behind the admin-only gate.
- **Legacy fulfillment layout** (32KB `blocks/fulfillment/Fulfillment.jsx`) —
  design follows the controller's confirmed behaviours only.
- **`OrderModal` field validators**, **`OrderDetailsDrawer` deep shape**,
  **`ProfilePage` info-card bodies**, **`LinkModel`/`ImportModal`** internals —
  sections/structure read, not every rule. See `github.md` "Not yet built".

## F · Per-screen quick index

Every screen's own gaps are in `ui_kits/screen-manifest.json` → each entry's
`domainBound` array. Resolved-this-pass items (ticket reasons, order columns/
actions/fields, product filter) are in `DOMAIN_RESOLVED.md`.

---

### Standing rules (from `BACKEND_ASKS.md`, repeated because they govern this file)
1. **No invented business truth** — no field → drop the block or ship empty.
2. **Vocabulary comes from the enum** — `ORDER_STATUS`/`Ticket*`/`USER_ROLE` verbatim.
3. **Aggregates belong to the server** — deltas/shares/rates only when the API returns both sides.
