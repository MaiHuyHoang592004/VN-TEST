/**
 * Inventory refusals, as codes. Same discipline as StationError: the UI
 * localises off `code`, the API returns it verbatim, and nobody parses English
 * to decide what happened. `detail` carries the items that caused it, so
 * "insufficient stock" can name which ones.
 */
export type InventoryErrorCode =
  /** The actor is not a member of the customer they named. */
  | "customer-not-allowed"
  /** The material or SKU does not exist, or is soft-deleted. */
  | "item-not-found"
  /** A reduction that would take a count below zero. */
  | "below-zero"
  /** A reservation or consumption the shelf cannot cover. */
  | "insufficient-stock"
  /** A receipt, shipment or line id that matches nothing the actor may see. */
  | "not-found"
  /** The shipment or receipt has already been settled or rejected. */
  | "not-receivable"
  /** Editing a receipt that someone has already received against. */
  | "not-editable"
  /**
   * A received quantity BELOW what is already booked in. Receiving is
   * monotonic: stock moves by the delta, so a lower number would have to
   * un-receive goods that are physically on the shelf.
   */
  | "received-below-current"
  /**
   * A REQUIRED BOM line has no material behind it, so the recipe cannot say
   * what to reserve. Refused rather than skipped: silently ignoring an
   * unmapped component builds the order short and calls it success.
   */
  | "bom-line-unmapped";

export class InventoryError extends Error {
  readonly code: InventoryErrorCode;
  readonly detail?: unknown;
  // Fields assigned explicitly, not via parameter properties: node --test
  // strips types rather than compiling them (modules/README.md).
  constructor(code: InventoryErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
    this.detail = detail;
  }
}
