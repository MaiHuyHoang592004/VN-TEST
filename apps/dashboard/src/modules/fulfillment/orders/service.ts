/**
 * orders — creation, reading, status, assignment.
 *
 * THIS FILE IS THE PUBLIC SURFACE. Everything below it lives in `service/`,
 * one file per act, so that the money path can be read end to end without
 * scrolling past anything that cannot move a balance. Callers import the layer
 * name (modules/README.md) and never reach into `service/` directly.
 *
 *   service/reads.ts          listOrders / listOrdersCursor / getOrder
 *   service/writes.ts         create, import, edit, soft delete
 *   service/status-change.ts  THE status core — the map, audit, notifications
 *   service/assign.ts         THE MONEY PATH, and its preview
 *   service/refund.ts         the money path in reverse: quote, credit, cancel
 *   service/export.ts         the table as a spreadsheet (money columns gated)
 *   service/artwork.ts        re-pricing, and attaching design/mockup by hand
 *   service/api-patch.ts      the public API's partial update (doc 07 F1)
 *   service/timeline.ts       the five milestones, read from the audit log
 *   service/shared.ts         actor type, resumeTo helpers
 *
 * Transport-agnostic throughout: the web actions, the spreadsheet importer and
 * /api/v1 all call these functions with an explicit actor, so a rule cannot
 * hold on one route and be missing on another.
 */
export {
  listOrders,
  listOrdersCursor,
  getOrder,
  orderStatusSummary,
  type OrderListQuery,
} from "./service/reads.ts";
export {
  createOrder,
  createOrders,
  updateOrder,
  deleteOrders,
} from "./service/writes.ts";
export {
  applyStatusChange,
  dispatchStatusWebhooks,
  updateStatus,
  type StatusChange,
  type StatusSubject,
} from "./service/status-change.ts";
export { assignOrders, previewAssignment } from "./service/assign.ts";
export {
  adminRefundOrders,
  refundQuote,
  type RefundBlock,
  type RefundLine,
  type RefundQuote,
} from "./service/refund.ts";
export { exportOrders, MAX_EXPORT_ROWS } from "./service/export.ts";
export {
  recalcOrders,
  setOrderArtwork,
  ArtworkError,
  type ArtworkErrorCode,
} from "./service/artwork.ts";
export { patchOrder, PatchError, type PatchErrorCode } from "./service/api-patch.ts";
export {
  orderTimeline,
  TIMELINE_STEPS,
  type TimelineEntry,
  type TimelineStep,
} from "./service/timeline.ts";
