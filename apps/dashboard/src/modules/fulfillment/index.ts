/**
 * fulfillment — orders and their journey to a doorstep: creation, assignment,
 * status, shipments, labels.
 *
 * Public surface for other domains (see identity/index.ts for the rule).
 * finance reads orders to link a transaction back to what was bought; nothing
 * outside this domain writes one.
 */
export { getOrder, listOrders } from "./orders/service.ts";

// What an order is worth back. finance's seller-facing refund REQUEST reads it
// so the number a seller is quoted is the arithmetic the admin refund performs;
// the refund itself stays here, because only this domain writes an order.
export {
  refundQuote,
  type RefundBlock,
  type RefundLine,
  type RefundQuote,
} from "./orders/service.ts";

// doc 05's scan stations decide what a scan may do by reading this map, rather
// than restating the lifecycle in a switch that can disagree with the service.
export {
  allowedTransitions,
  canTransition,
  InvalidTransitionError,
  PROCESSING,
  TERMINAL,
} from "./orders/status.ts";
