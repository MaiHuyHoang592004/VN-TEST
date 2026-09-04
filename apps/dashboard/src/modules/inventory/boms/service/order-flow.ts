/**
 * THE ORDER-FLOW LIFECYCLE — the reason BOMs exist.
 *
 *   assign  → reserveForOrder   hold the components on the shelf
 *   produce → consumeForOrder   take them off it
 *   cancel  → releaseForOrder   put them back
 *
 * ALL THREE ARE NO-OPS UNLESS `INVENTORY_ORDER_FLOW=1`.
 *
 * That switch is a port of legacy's ORDER_INVENTORY_ENABLED, and it is not
 * timidity: stock enforcement must stay OFF until the counts are trusted after
 * the cutover, because a wrong count with enforcement on does not show up as a
 * wrong number — it shows up as an order that cannot be assigned. Flipping it
 * needs no deploy, and the guard is at the top of each function so a call site
 * never has to know.
 *
 * Warehouse is ALWAYS Order.warehouseId. Legacy resolved it from the scanning
 * USER's home customer, so a manager helping at another site quietly moved
 * that site's stock (bom.service.ts:1043-1052). This is the fix, and it is why
 * these take an order id rather than a customer.
 *
 * Every function is IDEMPOTENT. Each is reachable from more than one path —
 * a scan, a column menu, the API — and the second call must be a no-op rather
 * than a second helping.
 */
import { Prisma } from "@gwprint/db";

import { availableOf } from "../../stock/counters.ts";
import {
  InventoryError,
  itemWhere,
  resolveNeeded,
  writeMovement,
  type ItemRef,
  type Tx,
} from "../../stock/service.ts";
import { explode, type Requirement } from "./explode.ts";

/** Read at CALL time, not module load: a test can flip it between cases, and
 * a serverless instance need not be recycled for the switch to take effect. */
export const orderFlowEnabled = () => process.env.INVENTORY_ORDER_FLOW === "1";

type OrderRow = {
  id: number;
  quantity: number;
  warehouseId: number | null;
  productVariantId: number | null;
};

/**
 * One item an order could not get. Carried on the thrown error so the caller
 * can BOTH tell the user which items blocked them and record the backlog after
 * the rollback — the ref is what makes the second half possible.
 */
export type ShortItem = {
  ref: ItemRef;
  sku: string;
  name: string;
  required: number;
  available: number;
  shortage: number;
};

/** The `detail` shape on an "insufficient-stock" InventoryError from here. */
export type InsufficientStockDetail = { orderId: number; items: ShortItem[] };

/** The order's own facts, loaded inside the caller's transaction. Taking an id
 * rather than a shaped object means no call site has to widen its select. */
async function loadOrder(tx: Tx, orderId: number): Promise<OrderRow | null> {
  return tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, quantity: true, warehouseId: true, productVariantId: true },
  });
}

/**
 * Hold stock for an order. Called from assignOrders, inside its transaction,
 * so a failure here rolls the money back with it.
 *
 * Reserving does NOT touch onHand — the goods are still on the shelf until
 * production takes them. It raises `reserved`, and availability subtracts it.
 * Legacy's two services disagreed about this; §0b picked one.
 */
export async function reserveForOrder(tx: Tx, orderId: number, actorId?: string | null) {
  if (!orderFlowEnabled()) return { reserved: 0, skipped: true as const };

  const order = await loadOrder(tx, orderId);
  if (!order?.warehouseId || !order.productVariantId) return { reserved: 0, skipped: true as const };
  const warehouseId = order.warehouseId;

  // Idempotent: an order that already holds stock is not re-held. Checked
  // BEFORE exploding, so a repeat costs one indexed query.
  const held = await tx.inventoryReservation.count({
    where: { orderId, status: { in: ["RESERVED", "CONSUMED"] } },
  });
  if (held > 0) return { reserved: 0, alreadyHeld: true as const };

  const requirements = await explode(tx, order.productVariantId, order.quantity);
  if (!requirements.length) return { reserved: 0, skipped: true as const };

  // Settle any shortage this order recorded on a previous attempt first —
  // otherwise its own backlog suppresses the availability it is about to ask
  // for, and a retry after stock arrives still fails.
  for (const r of requirements) await resolveNeeded(tx, r.ref, warehouseId, actorId);

  const short: ShortItem[] = [];
  for (const r of requirements) {
    const available = await availableInWarehouse(tx, r.ref, warehouseId);
    if (available < r.quantity) {
      short.push({
        ref: r.ref,
        sku: r.sku,
        name: r.name,
        required: r.quantity,
        available,
        shortage: r.quantity - available,
      });
    }
  }

  if (short.length) {
    // The backlog is NOT written here. This runs inside the caller's
    // transaction, which this throw is about to roll back — anything written
    // would vanish with it. The caller records it afterwards, on its own, so
    // "we are 40 buckles short" survives the failure and reaches the buyer's
    // tile. See recordShortage(), and the `items` carried on the error.
    throw new InventoryError(
      "insufficient-stock",
      "Not enough stock to reserve for this order.",
      { orderId, items: short },
    );
  }

  let reserved = 0;
  for (const r of requirements) {
    // ATOMIC GUARDED UPDATE. The availability check above is advisory: between
    // it and here another assignment can take the last unit. The WHERE clause
    // is what actually decides, and rowcount 0 means we lost that race.
    const changed = await guardedReserve(tx, r.ref, warehouseId, r.quantity);
    if (!changed) {
      throw new InventoryError(
        "insufficient-stock",
        "Another order took that stock first.",
        { orderId, items: [{ sku: r.sku, name: r.name, required: r.quantity, available: 0 }] },
      );
    }

    const reservation = await tx.inventoryReservation.create({
      data: {
        ...refColumns(r.ref),
        warehouseId,
        orderId,
        bomId: r.bomId,
        bomLineId: r.bomLineId,
        quantity: r.quantity,
        status: "RESERVED",
        createdById: actorId ?? null,
      },
      select: { id: true },
    });
    await writeMovement(tx, {
      ref: r.ref,
      warehouseId,
      type: "RESERVE",
      quantity: r.quantity,
      actorId,
      orderId,
      reservationId: reservation.id,
      bomId: r.bomId,
      bomLineId: r.bomLineId,
      referenceType: "order",
      referenceId: String(orderId),
    });
    reserved += r.quantity;
  }

  return { reserved };
}

/**
 * Write the shortage backlog for an order that could not be reserved.
 *
 * Separate from reserveForOrder because that runs inside the caller's
 * transaction and throws — anything it wrote would roll back with it. This
 * runs AFTER, on its own, so "we are 40 buckles short" survives the failure
 * and reaches the buyer's tile. Once per order per item: a retried assignment
 * must not stack the same shortage twice.
 */
export async function recordShortage(
  tx: Tx,
  orderId: number,
  items: Pick<ShortItem, "ref" | "shortage">[],
  actorId?: string | null,
) {
  if (!orderFlowEnabled()) return;
  const order = await loadOrder(tx, orderId);
  if (!order?.warehouseId) return;

  for (const item of items) {
    if (item.shortage <= 0) continue;
    const already = await tx.inventoryMovement.count({
      where: { orderId, type: "NEEDED", ...itemWhere(item.ref) },
    });
    if (already > 0) continue;

    const data = { needed: { increment: item.shortage } };
    if (item.ref.itemType === "MATERIAL") {
      await tx.materialStock.upsert({
        where: {
          warehouseId_materialId: {
            warehouseId: order.warehouseId,
            materialId: item.ref.itemId,
          },
        },
        create: { warehouseId: order.warehouseId, materialId: item.ref.itemId, quantity: 0, needed: item.shortage },
        update: data,
      });
    } else {
      await tx.warehouseInventory.upsert({
        where: {
          warehouseId_productVariantId: {
            warehouseId: order.warehouseId,
            productVariantId: item.ref.itemId,
          },
        },
        create: {
          warehouseId: order.warehouseId,
          productVariantId: item.ref.itemId,
          quantity: 0,
          needed: item.shortage,
        },
        update: data,
      });
    }

    await writeMovement(tx, {
      ref: item.ref,
      warehouseId: order.warehouseId,
      type: "NEEDED",
      quantity: item.shortage,
      actorId,
      orderId,
      referenceType: "order",
      referenceId: String(orderId),
    });
  }
}

/**
 * Take the held stock off the shelf. Called when an order enters production.
 *
 * onHand and reserved come down TOGETHER — the units leave the building and
 * stop being held, and doing one without the other is how a shelf ends up
 * holding stock for an order that was built last month.
 */
export async function consumeForOrder(tx: Tx, orderId: number, actorId?: string | null) {
  if (!orderFlowEnabled()) return { consumed: 0, skipped: true as const };

  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId, status: "RESERVED" },
    select: {
      id: true,
      materialId: true,
      productVariantId: true,
      warehouseId: true,
      quantity: true,
      consumedQuantity: true,
      bomId: true,
      bomLineId: true,
    },
  });
  if (!reservations.length) return { consumed: 0, alreadyDone: true as const };

  let consumed = 0;
  for (const column of reservations) {
    const ref = refOf(column);
    const q = column.quantity - column.consumedQuantity;
    if (q <= 0) continue;

    // Guarded on BOTH counters: neither may go negative, and a single UPDATE
    // means there is no window where one has moved and the other has not.
    const changed = await guardedConsume(tx, ref, column.warehouseId, q);
    if (!changed) {
      throw new InventoryError(
        "insufficient-stock",
        "The held stock is no longer on the shelf.",
        { orderId, reservationId: column.id },
      );
    }

    await tx.inventoryReservation.update({
      where: { id: column.id },
      data: { consumedQuantity: column.quantity, status: "CONSUMED" },
    });
    await writeMovement(tx, {
      ref,
      warehouseId: column.warehouseId,
      // NEGATIVE: movements that take stock away carry the minus, and the
      // ledger renders red/green off the sign (§0b).
      type: "CONSUME",
      quantity: -q,
      actorId,
      orderId,
      reservationId: column.id,
      bomId: column.bomId,
      bomLineId: column.bomLineId,
      referenceType: "order",
      referenceId: String(orderId),
    });
    consumed += q;
  }

  return { consumed };
}

/**
 * Give the stock back. Called when an order is cancelled.
 *
 * Two different undos, because the stock is in two different places:
 *   RESERVED → still on the shelf, just held  → drop the hold (RESERVE_RELEASE)
 *   CONSUMED → already taken off it           → put it back  (RETURN)
 */
export async function releaseForOrder(tx: Tx, orderId: number, actorId?: string | null) {
  if (!orderFlowEnabled()) return { released: 0, skipped: true as const };

  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId, status: { in: ["RESERVED", "CONSUMED"] } },
    select: {
      id: true,
      materialId: true,
      productVariantId: true,
      warehouseId: true,
      quantity: true,
      consumedQuantity: true,
      status: true,
      bomId: true,
      bomLineId: true,
    },
  });
  if (!reservations.length) return { released: 0, alreadyDone: true as const };

  let released = 0;
  for (const column of reservations) {
    const ref = refOf(column);

    if (column.status === "CONSUMED") {
      const q = column.consumedQuantity || column.quantity;
      await bumpCounters(tx, ref, column.warehouseId, { quantity: q });
      await tx.inventoryReservation.update({ where: { id: column.id }, data: { status: "RETURNED" } });
      await writeMovement(tx, {
        ref,
        warehouseId: column.warehouseId,
        type: "RETURN",
        quantity: q,
        actorId,
        orderId,
        reservationId: column.id,
        bomId: column.bomId,
        bomLineId: column.bomLineId,
        referenceType: "order",
        referenceId: String(orderId),
      });
      released += q;
      continue;
    }

    const q = column.quantity - column.consumedQuantity;
    await bumpCounters(tx, ref, column.warehouseId, { reserved: -q });
    await tx.inventoryReservation.update({ where: { id: column.id }, data: { status: "RELEASED" } });
    await writeMovement(tx, {
      ref,
      warehouseId: column.warehouseId,
      type: "RESERVE_RELEASE",
      quantity: q,
      actorId,
      orderId,
      reservationId: column.id,
      bomId: column.bomId,
      bomLineId: column.bomLineId,
      referenceType: "order",
      referenceId: String(orderId),
    });
    released += q;
  }

  // Stock coming back can settle a shortage another order recorded.
  for (const column of reservations) {
    await resolveNeeded(tx, refOf(column), column.warehouseId, actorId);
  }

  return { released };
}

/** What an order WOULD need — for the preview and for the caller that has to
 * report which items are short after a failure. */
export async function requirementsForOrder(tx: Tx, orderId: number): Promise<Requirement[]> {
  const order = await loadOrder(tx, orderId);
  if (!order?.productVariantId) return [];
  return explode(tx, order.productVariantId, order.quantity);
}

// ── The raw counter updates ──────────────────────────────────────────────────

const refOf = (column: { materialId: number | null; productVariantId: number | null }): ItemRef =>
  column.materialId != null
    ? { itemType: "MATERIAL", itemId: column.materialId }
    : { itemType: "PRODUCT", itemId: column.productVariantId! };

const refColumns = (ref: ItemRef) =>
  ref.itemType === "MATERIAL"
    ? { itemType: "MATERIAL" as const, materialId: ref.itemId }
    : { itemType: "PRODUCT" as const, productVariantId: ref.itemId };

async function availableInWarehouse(tx: Tx, ref: ItemRef, warehouseId: number): Promise<number> {
  const column =
    ref.itemType === "MATERIAL"
      ? await tx.materialStock.findUnique({
          where: { warehouseId_materialId: { warehouseId, materialId: ref.itemId } },
          select: { quantity: true, reserved: true, needed: true },
        })
      : await tx.warehouseInventory.findUnique({
          where: { warehouseId_productVariantId: { warehouseId, productVariantId: ref.itemId } },
          select: { quantity: true, reserved: true, needed: true },
        });
  // The one formula, imported rather than restated — see stock/counters.ts.
  return column ? availableOf(column) : 0;
}

/**
 * `reserved += q` ONLY IF the shelf can still cover it, in one statement.
 *
 * Raw SQL because the guard is an expression over three columns
 * (`quantity - reserved - needed >= q`), which Prisma's `where` cannot express.
 * This is the concurrency boundary of the whole reservation path: two orders
 * racing for the last unit both pass the advisory check above, and exactly one
 * gets a rowcount of 1 here.
 */
async function guardedReserve(tx: Tx, ref: ItemRef, warehouseId: number, q: number) {
  const rows =
    ref.itemType === "MATERIAL"
      ? await tx.$executeRaw(Prisma.sql`
          UPDATE material_stock SET reserved = reserved + ${q}
           WHERE warehouse_id = ${warehouseId} AND material_id = ${ref.itemId}
             AND (quantity - reserved - needed) >= ${q}
        `)
      : await tx.$executeRaw(Prisma.sql`
          UPDATE warehouse_inventory SET reserved = reserved + ${q}
           WHERE warehouse_id = ${warehouseId} AND product_variant_id = ${ref.itemId}
             AND (quantity - reserved - needed) >= ${q}
        `);
  return rows > 0;
}

/** `quantity -= q AND reserved -= q`, both guarded, in one statement. */
async function guardedConsume(tx: Tx, ref: ItemRef, warehouseId: number, q: number) {
  const rows =
    ref.itemType === "MATERIAL"
      ? await tx.$executeRaw(Prisma.sql`
          UPDATE material_stock SET quantity = quantity - ${q}, reserved = reserved - ${q}
           WHERE warehouse_id = ${warehouseId} AND material_id = ${ref.itemId}
             AND quantity >= ${q} AND reserved >= ${q}
        `)
      : await tx.$executeRaw(Prisma.sql`
          UPDATE warehouse_inventory SET quantity = quantity - ${q}, reserved = reserved - ${q}
           WHERE warehouse_id = ${warehouseId} AND product_variant_id = ${ref.itemId}
             AND quantity >= ${q} AND reserved >= ${q}
        `);
  return rows > 0;
}

/** Unguarded increments, for the paths that only ever give stock BACK. */
async function bumpCounters(
  tx: Tx,
  ref: ItemRef,
  warehouseId: number,
  delta: { quantity?: number; reserved?: number },
) {
  const data = {
    ...(delta.quantity ? { quantity: { increment: delta.quantity } } : {}),
    ...(delta.reserved ? { reserved: { increment: delta.reserved } } : {}),
  };
  const where = { warehouseId, ...itemWhere(ref) };
  if (ref.itemType === "MATERIAL") await tx.materialStock.updateMany({ where, data });
  else await tx.warehouseInventory.updateMany({ where, data });
}
