/**
 * boms — what a SKU is made of, and what that means when an order moves.
 *
 * THIS FILE IS THE PUBLIC SURFACE. Everything below lives in `service/`:
 *
 *   service/config.ts      list/get/create/update/activate/duplicate/delete
 *   service/explode.ts     "make N of this" → "take these off these shelves"
 *   service/preview.ts     previewConsumption, bomCoverage — read-only
 *   service/order-flow.ts  reserve / consume / release — THE point of BOMs
 *
 * Two rules carry the whole domain:
 *
 * · Exactly ONE version per product may be ACTIVE. Two would make "what does
 *   this order need?" ambiguous at assignment, so every activation path
 *   deactivates its siblings in the same transaction.
 * · The order flow is OFF unless INVENTORY_ORDER_FLOW=1. Stock enforcement
 *   must not turn on before the counts are trusted post-cutover, because a
 *   wrong count with enforcement on surfaces as an order that cannot be
 *   assigned rather than as a wrong number.
 */
export {
  activateBom,
  createBom,
  deleteBom,
  duplicateBom,
  getBom,
  listBoms,
  listVersions,
  updateBom,
  type BomFilter,
} from "./service/config.ts";
export { activeBomFor, explode, type Requirement } from "./service/explode.ts";
export { bomCoverage, previewConsumption, type PreviewLine } from "./service/preview.ts";
export {
  consumeForOrder,
  orderFlowEnabled,
  recordShortage,
  releaseForOrder,
  requirementsForOrder,
  reserveForOrder,
  type InsufficientStockDetail,
  type ShortItem,
} from "./service/order-flow.ts";
