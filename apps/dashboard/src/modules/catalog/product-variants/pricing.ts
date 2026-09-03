/**
 * What a given seller pays for a given SKU. THE function money flows through:
 * Phase B's assignOrders charges `effectivePrice × quantity`, so a bug here is
 * a billing bug, not a display bug.
 *
 * Deliberately pure — no database, no actor, no I/O. It takes the rows and
 * returns a Decimal, which is what lets it be tested exhaustively before any
 * order code exists.
 *
 * Two rules it exists to enforce, both of which the legacy system got wrong:
 *
 *  1. FALL BACK, never fail. Legacy read `price_tier_${user.tier}` straight
 *     off the column, so a seller whose tier was null got `price_tier_undefined`
 *     — an order that cost nothing. Here an unknown or absent tier lands on
 *     the tier-0 base price, and only then on salePrice.
 *
 *  2. ZERO IS A PRICE. Falling back with `||` would treat a legitimate 0.00
 *     (a free replacement, a sample) as "unset" and silently charge the base
 *     price instead. Every fallback below is on ROW ABSENCE, never on value
 *     truthiness.
 *
 * Decimal in, Decimal out — a value never becomes a JS float, because 0.1+0.2
 * is not 0.3 and money that is off by a cent per order is off by real money at
 * the end of the month.
 */
import { Prisma } from "@opcreative/db";

/** The minimum a caller must load: the SKU's own price plus its tier rows. */
export type PricedSku = {
  salePrice: Prisma.Decimal;
  prices: { tier: number; price: Prisma.Decimal }[];
};

/** tier 0 is the base/public price; 1-4 match User.tier. */
export const BASE_TIER = 0;

/**
 * The price `tier` pays for `sku`.
 *
 * tier null/undefined (an untiered seller) or a tier with no column → the tier-0
 * base price → the SKU's salePrice if even that is missing.
 */
export function effectivePrice(sku: PricedSku, tier: number | null | undefined): Prisma.Decimal {
  const at = (t: number) => sku.prices.find((p) => p.tier === t);
  // Only look up a specific tier when one was actually supplied; `tier ?? 0`
  // would work today but hides the distinction the next reader needs.
  const column = (typeof tier === "number" ? at(tier) : undefined) ?? at(BASE_TIER);
  return column ? column.price : sku.salePrice;
}
