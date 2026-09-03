/**
 * The availability formula. It exists HERE and nowhere else.
 *
 *   available = max(onHand − reserved − needed, 0)
 *
 * Every tile, every table cell, every preview and the reservation guard call
 * availableOf(). Nobody re-derives it, and `grep -rn "quantity - reserved"`
 * returning nothing but this file is part of what makes doc 06 "done".
 *
 * The reason is not tidiness. Legacy stored an `available`-shaped row
 * (WarehouseInventory.stock) that four different services maintained by hand,
 * and they disagreed — two of them even disagreed about whether reserving
 * decrements onHand. A stored copy of a derived number is a second source of
 * truth, and a second source of truth drifts. So availability is computed on
 * read, from one function, and the legacy row is left dead.
 *
 * Deliberately prisma-free so a client component can call it too: the moment
 * the formula is unreachable from the browser, someone re-types it into a
 * component, and there are two again.
 */

/** The four counters every stock column carries, whatever table it lives in. */
export type StockCounters = {
  /** Units physically present, INCLUDING reserved. */
  quantity: number;
  /** Held for assigned orders, still on the shelf. */
  reserved: number;
  /** Shortage backlog: units promised that were not there. */
  needed: number;
};

/**
 * Units free to promise to a new order.
 *
 * Clamped at zero: `needed` is a backlog rather than a claim on real units, so
 * over-subtracting is normal and a negative availability would render as a
 * nonsense count and, worse, sail through a `>= required` guard as a number.
 */
export function availableOf(column: StockCounters): number {
  return Math.max(column.quantity - column.reserved - column.needed, 0);
}

/**
 * Units physically present that nothing is holding — availability WITHOUT the
 * shortage backlog subtracted.
 *
 * The one place this differs from availableOf is clearing that backlog: a
 * shortage is settled by units that actually arrived, not by units that are
 * still notionally short, and using availableOf there would subtract `needed`
 * from the very number deciding how much of `needed` to clear. Named rather
 * than written inline so no bare `quantity - reserved` exists anywhere either.
 */
export function unreservedOf(column: StockCounters): number {
  return Math.max(column.quantity - column.reserved, 0);
}

/** Sum the counters of several rows (an item across its warehouses). */
export function totalOf(rows: readonly StockCounters[]): StockCounters & { available: number } {
  const total = rows.reduce(
    (acc, r) => ({
      quantity: acc.quantity + r.quantity,
      reserved: acc.reserved + r.reserved,
      needed: acc.needed + r.needed,
    }),
    { quantity: 0, reserved: 0, needed: 0 },
  );
  return { ...total, available: availableOf(total) };
}
