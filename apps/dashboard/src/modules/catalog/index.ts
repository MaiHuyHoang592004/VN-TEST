/**
 * catalog — what can be sold: products, the product axes they combine with,
 * the sellable SKUs and their tier prices, and the mockups orders print from.
 *
 * Public surface for other domains (see identity/index.ts for the rule).
 * Everything else in this folder is private; fulfillment and finance reach
 * catalog through this file or not at all.
 */

// fulfillment resolves the variant and product an order points at, and needs
// the pickers on the order form to honour the same partner allow-list the
// catalogue does — so it takes the scoped readers, never raw prisma.
export { getProduct, listProducts } from "./products/service.ts";
export { getVariant, listVariants } from "./variants/service.ts";
export { getMockup, listMockups } from "./mockups/service.ts";
export { listSkusForProduct, tierOf } from "./product-variants/service.ts";

/**
 * What a seller pays for a SKU. Phase B's assignOrders charges through THIS
 * export — the domain rule is that fulfillment never reaches past index.ts to
 * reimplement a price, because two pricing rules eventually disagree and the
 * one that disagrees is the one billing people.
 */
export { effectivePrice, BASE_TIER, type PricedSku } from "./product-variants/pricing.ts";
