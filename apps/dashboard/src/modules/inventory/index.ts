/**
 * inventory — physical sites and what sits in them: warehouses, membership,
 * stock, suppliers, BOMs, receipts and movements.
 *
 * Public surface for other domains (see identity/index.ts for the rule).
 */

// fulfillment needs to resolve and display the site an order belongs to.
export { getWarehouse, listWarehouses } from "./warehouses/service.ts";

/**
 * The order-flow lifecycle — the ONLY inventory surface fulfillment touches.
 *
 * Assignment holds stock, entering production takes it, cancelling gives it
 * back. All three are no-ops unless INVENTORY_ORDER_FLOW=1, so the call sites
 * need no flag of their own, and all three take an ORDER ID: the customer is
 * always Order.warehouseId, never the acting user's home site (doc 06 §D2).
 */
export {
  consumeForOrder,
  orderFlowEnabled,
  recordShortage,
  releaseForOrder,
  reserveForOrder,
  type InsufficientStockDetail,
} from "./boms/service.ts";
export { InventoryError } from "./stock/service.ts";
