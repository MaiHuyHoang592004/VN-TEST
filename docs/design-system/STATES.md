# Screen state matrix

The five non-happy states an AI import must build for every data screen, and the
system component that renders each. Getting these right is most of what stops an
import from shipping a screen that only works when the data is present and the
user is an admin. Each state maps to one component already in the system — don't
hand-roll them.

| State | Component | Rule |
|---|---|---|
| **Loading (shape known)** | `Skeleton` | Table rows, KPI figures, key/value lists. Match the skeleton's size to the real content so nothing reflows. Never > ~2s. |
| **Loading (region, shape unknown)** | `LoadingState` | A whole empty panel/page before first data. `variant="brand"` for full-page (auth, `SystemLoader`). |
| **Empty (no rows yet)** | `EmptyState` | Warm + specific: what it is and what to do next. Never "No data". |
| **Error (request failed)** | `Callout tone="critical"` | State what failed + a retry affordance. Toasts (`ToastStack`) for a failed *action*, not a failed load. |
| **No permission** | `Callout` / dedicated card | Show the source's exact copy where one exists (Label Extractor "Access Denied"); otherwise hide the gated control entirely. |
| **Disabled control** | native `disabled` | For a real gate (missing permission, unmet precondition), with a reason nearby. `--navy-400` ink is allowed here (non-text). |

## Loading

- **Auto-refreshing statuses.** Orders whose `warehouse_status` is one of the
  `metadata.ts` `loading:true` set — **Validating · Mockup Generating ·
  Processing** — poll/refresh. Show the row's live state, not a full-screen
  spinner. `StatusBadge` already renders these three with a subtle motion cue.
- **Skeleton counts.** Use the page's own default page size for row skeletons
  (orders `pageSize:5`, tickets `10`, recipients `12`) so the first paint
  matches the landed layout.

## Empty — real copy per surface

Grounded in the built screens; reuse verbatim:
- Orders: *"No orders yet"* → *"Orders you create or import will show up here, with production and shipping status."*
- Catalog / search: *"No products match"* → clear-filters affordance.
- Tickets: *"No tickets"* → the reason list is fixed (see `DOMAIN_RESOLVED.md`).
- Wallet transactions: *"No transactions yet"*.
- BOM Stock: coverage `unmapped` → **"Not Assigned"** (a setup problem, not empty stock); `needed` → **"Shortage"**.

## Error

- A failed **load** → `Callout tone="critical"` in the content region with a
  retry button; keep the shell (nav, page title) intact.
- A failed **action** (save, assign, delete) → `Toast tone="critical"` with a
  one-clause message; the form stays open with its values.
- Never blank the whole screen on error — the nav and page identity always
  remain (accessibility floor: page identity is always reachable).

## No-permission — the gates that actually exist

From the role map (`github.md`) + `DOMAIN_RESOLVED.md`. When a role lacks a
capability, **remove the control**, don't disable it, unless the source disables
it:
- **Admin-only within a shared screen:** Users → Balance column + Top up /
  Refund / Communication channels are spliced in for `isAdmin` only; a supporter
  never sees them.
- **`canAdjust = admin || warehouse_admin`:** Material Inventory Stock tab has
  **no Action column at all** without it.
- **Label Extractor:** non-admins get the source's exact **"Access Denied"**
  card — show it, don't 404.
- **`warehouse_external` with no `configs.products`:** order list is
  fail-closed to empty (UBR-017) — show the normal `EmptyState`, not an error.
- **Toolbar/row actions** are per-role sets (`DOMAIN_RESOLVED.md` §3): render
  only the current role's set; `designer` and `warehouse_external` get none.

## Disabled (precondition, not permission)

- OrderModal create: **Save disabled** until `design` + `mockup` present (for
  admin/warehouse_admin/customer).
- Notifications Compose: **Send disabled** until a customer row selected; a
  channel is selectable only when `status:active` AND its type is enabled —
  blocked rows state why.
- BOM editor: **New BOM disabled** until a product variant is picked.
- Fulfillment Ops: **basket_position Edit disabled** (permission not open to
  workers — BACKEND_ASKS §4).
- Warehouse `code`: **locked once set** (edit disabled with the source's hint).
