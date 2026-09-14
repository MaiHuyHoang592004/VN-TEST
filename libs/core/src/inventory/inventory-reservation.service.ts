import { prisma, Prisma } from "@fulfillflow/db";
import { openException } from "../exceptions/open-exception.ts";
import { incrementReserved, decrementReserved, decrementOnHandAndReserved, InsufficientStockError } from "./inventory-ledger.service.ts";

class MissingBomError extends Error {
  readonly skuId: string;
  constructor(skuId: string) {
    super(`no ACTIVE BomRevision for sku ${skuId}`);
    this.skuId = skuId;
  }
}

type ComponentDemand = { inventoryItemId: string; bomComponentId: string | null; quantity: Prisma.Decimal };

type SkuWithActiveBom = {
  id: string;
  supplyMode: "MADE_TO_ORDER" | "FROM_STOCK";
  bomRevisions: Array<{ components: Array<{ id: string; inventoryItemId: string; quantityPerUnit: Prisma.Decimal; wastageRate: Prisma.Decimal }> }>;
};

function demandFor(sku: SkuWithActiveBom, quantity: number): ComponentDemand[] {
  if (sku.supplyMode === "FROM_STOCK") return [{ inventoryItemId: sku.id, bomComponentId: null, quantity: new Prisma.Decimal(quantity) }];
  const revision = sku.bomRevisions[0];
  if (!revision) throw new MissingBomError(sku.id);
  return revision.components.map((c) => ({
    inventoryItemId: c.inventoryItemId,
    bomComponentId: c.id,
    quantity: c.quantityPerUnit.times(new Prisma.Decimal(1).plus(c.wastageRate)).times(quantity),
  }));
}

/**
 * Reserves every component (direct SKU for FROM_STOCK, expanded BOM for
 * MADE_TO_ORDER) needed to produce a Fulfillment's items, at the
 * Fulfillment's facility. Idempotent per (fulfillmentItem, inventoryItem):
 * an existing ACTIVE reservation is left untouched, so a retry after a
 * partial failure only reserves what's still missing. Any shortfall aborts
 * the whole attempt (transaction rollback — no partial reservation) and
 * blocks the Fulfillment with one INTERNAL exception instead of throwing
 * out to the caller.
 */
export async function reserveFulfillment(fulfillmentId: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fulfillment" WHERE id = ${fulfillmentId} FOR UPDATE`;
      const fulfillment = await tx.fulfillment.findUniqueOrThrow({
        where: { id: fulfillmentId },
        include: {
          items: { include: { orderItem: { include: { sku: { include: {
            bomRevisions: { where: { status: "ACTIVE" }, include: { components: true } },
          } } } } } },
        },
      });
      for (const item of fulfillment.items) {
        for (const demand of demandFor(item.orderItem.sku, item.quantity)) {
          const existing = await tx.inventoryReservation.findFirst({
            where: { fulfillmentItemId: item.id, inventoryItemId: demand.inventoryItemId, status: "ACTIVE" },
          });
          if (existing) continue;
          const reservation = await tx.inventoryReservation.create({ data: {
            fulfillmentItemId: item.id, facilityId: fulfillment.facilityId, inventoryItemId: demand.inventoryItemId,
            bomComponentId: demand.bomComponentId, quantity: demand.quantity,
          } });
          await incrementReserved(tx, fulfillment.facilityId, demand.inventoryItemId, demand.quantity);
          await tx.inventoryMovement.create({ data: {
            facilityId: fulfillment.facilityId, inventoryItemId: demand.inventoryItemId, reservationId: reservation.id,
            fulfillmentId, reason: "RESERVE", reservedDelta: demand.quantity, idempotencyKey: `reserve:${reservation.id}`,
          } });
        }
      }
      if (fulfillment.status === "BLOCKED") await tx.fulfillment.update({ where: { id: fulfillmentId }, data: { status: "QUEUED" } });
    });
  } catch (error) {
    await blockFulfillment(fulfillmentId, error);
  }
}

async function blockFulfillment(fulfillmentId: string, error: unknown): Promise<void> {
  if (!(error instanceof InsufficientStockError) && !(error instanceof MissingBomError)) throw error;
  await prisma.$transaction(async (tx) => {
    const fulfillment = await tx.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId }, include: { order: { select: { organizationId: true } } } });
    await tx.fulfillment.update({ where: { id: fulfillmentId }, data: { status: "BLOCKED" } });
    const [code, details] = error instanceof InsufficientStockError
      ? (["INSUFFICIENT_STOCK", { inventoryItemId: error.inventoryItemId, facilityId: error.facilityId }] as const)
      : (["PRODUCTION_BLOCKED", { skuId: error.skuId }] as const);
    await openException(tx, {
      organizationId: fulfillment.order.organizationId, code, visibility: "INTERNAL",
      subjectKey: `fulfillment:${fulfillmentId}`, fulfillmentId, orderId: fulfillment.orderId,
      message: error.message, details,
    });
  });
}

/** Releases every ACTIVE reservation's unconsumed quantity for a Fulfillment. Idempotent — RELEASED rows are skipped. */
export async function releaseFulfillment(fulfillmentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT r.id FROM "InventoryReservation" r JOIN "FulfillmentItem" i ON i.id = r."fulfillmentItemId"
      WHERE i."fulfillmentId" = ${fulfillmentId} AND r.status = 'ACTIVE' ORDER BY r.id FOR UPDATE OF r`;
    const reservations = await tx.inventoryReservation.findMany({
      where: { fulfillmentItem: { fulfillmentId }, status: "ACTIVE" },
      orderBy: [{ facilityId: "asc" }, { inventoryItemId: "asc" }],
    });
    for (const reservation of reservations) {
      const remaining = reservation.quantity.minus(reservation.consumedQuantity);
      if (remaining.gt(0)) {
        await decrementReserved(tx, reservation.facilityId, reservation.inventoryItemId, remaining);
        await tx.inventoryMovement.create({ data: {
          facilityId: reservation.facilityId, inventoryItemId: reservation.inventoryItemId, reservationId: reservation.id,
          fulfillmentId, reason: "RELEASE", reservedDelta: remaining.negated(), idempotencyKey: `release:${reservation.id}`,
        } });
      }
      await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED" } });
    }
  });
}

/** Consumes MADE_TO_ORDER component reservations in full — production is complete, the components are gone. Idempotent. */
export async function consumeForProduction(fulfillmentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const reservations = await tx.inventoryReservation.findMany({
      where: { fulfillmentItem: { fulfillmentId }, bomComponentId: { not: null }, status: "ACTIVE" },
      orderBy: [{ facilityId: "asc" }, { inventoryItemId: "asc" }],
    });
    for (const reservation of reservations) {
      const remaining = reservation.quantity.minus(reservation.consumedQuantity);
      if (remaining.gt(0)) {
        await decrementOnHandAndReserved(tx, reservation.facilityId, reservation.inventoryItemId, remaining);
        await tx.inventoryMovement.create({ data: {
          facilityId: reservation.facilityId, inventoryItemId: reservation.inventoryItemId, reservationId: reservation.id,
          fulfillmentId, reason: "CONSUME", onHandDelta: remaining.negated(), reservedDelta: remaining.negated(),
          idempotencyKey: `consume:${reservation.id}`,
        } });
      }
      await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { consumedQuantity: reservation.quantity, status: "CONSUMED" } });
    }
  });
}

/**
 * Consumes FROM_STOCK reservations up to the fulfillment's cumulative
 * shipped quantity so far (summed across every Shipment/ShipmentItem for
 * each FulfillmentItem). Safe to call once per shipment, including partial
 * shipments: only the newly-shipped delta since the last call is consumed.
 * Exposed as a tx-scoped core (`consumeForShipmentTx`) so shipFulfillment
 * (Task 16) can run it inside the same transaction as the Shipment/
 * ShipmentItem writes it depends on — Prisma has no nested-transaction
 * support, so composing across two `$transaction` calls isn't possible.
 */
export async function consumeForShipmentTx(tx: Prisma.TransactionClient, fulfillmentId: string): Promise<void> {
  const reservations = await tx.inventoryReservation.findMany({
    where: { fulfillmentItem: { fulfillmentId }, bomComponentId: null, status: "ACTIVE" },
    orderBy: [{ facilityId: "asc" }, { inventoryItemId: "asc" }],
  });
  for (const reservation of reservations) {
    const shippedAgg = await tx.shipmentItem.aggregate({ where: { fulfillmentItemId: reservation.fulfillmentItemId }, _sum: { quantity: true } });
    const shippedTotal = new Prisma.Decimal(shippedAgg._sum.quantity ?? 0);
    const delta = shippedTotal.minus(reservation.consumedQuantity);
    if (delta.lte(0)) continue;
    await decrementOnHandAndReserved(tx, reservation.facilityId, reservation.inventoryItemId, delta);
    const consumedQuantity = reservation.consumedQuantity.plus(delta);
    await tx.inventoryMovement.create({ data: {
      facilityId: reservation.facilityId, inventoryItemId: reservation.inventoryItemId, reservationId: reservation.id,
      fulfillmentId, reason: "CONSUME", onHandDelta: delta.negated(), reservedDelta: delta.negated(),
      idempotencyKey: `consume:${reservation.id}:${consumedQuantity.toString()}`,
    } });
    await tx.inventoryReservation.update({ where: { id: reservation.id }, data: {
      consumedQuantity, status: consumedQuantity.gte(reservation.quantity) ? "CONSUMED" : "ACTIVE",
    } });
  }
}

export async function consumeForShipment(fulfillmentId: string): Promise<void> {
  await prisma.$transaction((tx) => consumeForShipmentTx(tx, fulfillmentId));
}
