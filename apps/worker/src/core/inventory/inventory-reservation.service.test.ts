import { test, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { reserveFulfillment, releaseFulfillment, consumeForProduction, consumeForShipment } from "./inventory-reservation.service.js";
import {
  setupInventory, createFromStockSku, createMtoSku, createFulfillment, cleanupInventory, type InventoryTestContext,
} from "./inventory-test-support.js";

let ctx: InventoryTestContext;
let skuIds: string[];
afterEach(async () => { if (ctx) await cleanupInventory(ctx, skuIds ?? []); });
after(async () => { await prisma.$disconnect(); });

test("FROM_STOCK reserves the SKU's own InventoryItem directly", async () => {
  ctx = await setupInventory();
  const skuId = await createFromStockSku(ctx, 10);
  skuIds = [skuId];
  const { fulfillment, fulfillmentItemId } = await createFulfillment(ctx, skuId, 3);

  await reserveFulfillment(fulfillment.id);

  const reservations = await prisma.inventoryReservation.findMany({ where: { fulfillmentItemId } });
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].inventoryItemId, skuId);
  assert.equal(reservations[0].bomComponentId, null);
  assert.equal(reservations[0].quantity.toString(), "3");
  assert.equal(reservations[0].status, "ACTIVE");
  const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId: ctx.facilityId, inventoryItemId: skuId } });
  assert.equal(balance.reserved.toString(), "3");
  assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })).status, "QUEUED");
  const movements = await prisma.inventoryMovement.findMany({ where: { reservationId: reservations[0].id } });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].reason, "RESERVE");
  assert.equal(movements[0].reservedDelta.toString(), "3");
});

test("MADE_TO_ORDER expands the active BOM by quantity and wastage into one reservation per component", async () => {
  ctx = await setupInventory();
  const { skuId, componentItemIds } = await createMtoSku(ctx, [
    { onHand: 100, quantityPerUnit: 2, wastageRate: 0.1 }, // 2 * 1.1 * qty(3) = 6.6
    { onHand: 100, quantityPerUnit: 1 }, // 1 * 1 * 3 = 3
  ]);
  skuIds = [skuId];
  const { fulfillment, fulfillmentItemId } = await createFulfillment(ctx, skuId, 3);

  await reserveFulfillment(fulfillment.id);

  const reservations = await prisma.inventoryReservation.findMany({ where: { fulfillmentItemId }, orderBy: { inventoryItemId: "asc" } });
  assert.equal(reservations.length, 2);
  const byItem = new Map(reservations.map((r) => [r.inventoryItemId, r]));
  assert.equal(byItem.get(componentItemIds[0])?.quantity.toString(), "6.6");
  assert.equal(byItem.get(componentItemIds[0])?.bomComponentId !== null, true);
  assert.equal(byItem.get(componentItemIds[1])?.quantity.toString(), "3");
  assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })).status, "QUEUED");
});

test("insufficient stock blocks the Fulfillment, opens one INTERNAL INSUFFICIENT_STOCK exception, and leaves balances unchanged", async () => {
  ctx = await setupInventory();
  const skuId = await createFromStockSku(ctx, 2);
  skuIds = [skuId];
  const { fulfillment, order } = await createFulfillment(ctx, skuId, 5);

  await reserveFulfillment(fulfillment.id);

  assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })).status, "BLOCKED");
  const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId: ctx.facilityId, inventoryItemId: skuId } });
  assert.equal(balance.reserved.toString(), "0");
  assert.equal(balance.onHand.toString(), "2");
  const exceptions = await prisma.exceptionCase.findMany({ where: { orderId: order.id } });
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].code, "INSUFFICIENT_STOCK");
  assert.equal(exceptions[0].visibility, "INTERNAL");
  assert.equal(await prisma.inventoryReservation.count({ where: { fulfillmentItem: { fulfillmentId: fulfillment.id } } }), 0);

  await reserveFulfillment(fulfillment.id);
  assert.equal(await prisma.exceptionCase.count({ where: { orderId: order.id } }), 1);
});

test("a missing ACTIVE BomRevision blocks the Fulfillment with one INTERNAL PRODUCTION_BLOCKED exception", async () => {
  ctx = await setupInventory();
  const item = await prisma.inventoryItem.create({ data: { code: crypto.randomUUID(), name: "no-bom", kind: "FINISHED_GOOD" } });
  await prisma.sku.create({ data: { id: item.id, productId: ctx.productId, supplyMode: "MADE_TO_ORDER" } });
  skuIds = [item.id];
  const { fulfillment, order } = await createFulfillment(ctx, item.id, 1);

  await reserveFulfillment(fulfillment.id);

  assert.equal((await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })).status, "BLOCKED");
  const exceptions = await prisma.exceptionCase.findMany({ where: { orderId: order.id } });
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].code, "PRODUCTION_BLOCKED");
});

test("20 concurrent reservations of qty=1 against stock=10 succeed exactly 10 times, with no negative balance", async () => {
  ctx = await setupInventory();
  const skuId = await createFromStockSku(ctx, 10);
  skuIds = [skuId];
  const fulfillments = await Promise.all(Array.from({ length: 20 }, () => createFulfillment(ctx, skuId, 1)));

  await Promise.all(fulfillments.map((f) => reserveFulfillment(f.fulfillment.id)));

  const statuses = await prisma.fulfillment.findMany({ where: { id: { in: fulfillments.map((f) => f.fulfillment.id) } }, select: { status: true } });
  assert.equal(statuses.filter((s) => s.status === "QUEUED").length, 10);
  assert.equal(statuses.filter((s) => s.status === "BLOCKED").length, 10);
  const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId: ctx.facilityId, inventoryItemId: skuId } });
  assert.equal(balance.onHand.toString(), "10");
  assert.equal(balance.reserved.toString(), "10");
  assert.ok(balance.reserved.lte(balance.onHand));
});

test("reserveFulfillment is idempotent: calling it again does not create a second reservation or movement", async () => {
  ctx = await setupInventory();
  const skuId = await createFromStockSku(ctx, 10);
  skuIds = [skuId];
  const { fulfillment, fulfillmentItemId } = await createFulfillment(ctx, skuId, 4);

  await reserveFulfillment(fulfillment.id);
  await reserveFulfillment(fulfillment.id);

  assert.equal(await prisma.inventoryReservation.count({ where: { fulfillmentItemId } }), 1);
  assert.equal(await prisma.inventoryMovement.count({ where: { fulfillmentId: fulfillment.id, reason: "RESERVE" } }), 1);
  const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId: ctx.facilityId, inventoryItemId: skuId } });
  assert.equal(balance.reserved.toString(), "4");
});

test("releaseFulfillment is idempotent and only releases ACTIVE reservations", async () => {
  ctx = await setupInventory();
  const skuId = await createFromStockSku(ctx, 10);
  skuIds = [skuId];
  const { fulfillment, fulfillmentItemId } = await createFulfillment(ctx, skuId, 4);
  await reserveFulfillment(fulfillment.id);

  await releaseFulfillment(fulfillment.id);
  await releaseFulfillment(fulfillment.id);

  const reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { fulfillmentItemId } });
  assert.equal(reservation.status, "RELEASED");
  const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId: ctx.facilityId, inventoryItemId: skuId } });
  assert.equal(balance.reserved.toString(), "0");
  assert.equal(balance.onHand.toString(), "10");
  assert.equal(await prisma.inventoryMovement.count({ where: { reservationId: reservation.id, reason: "RELEASE" } }), 1);
});

test("consumeForProduction consumes MTO component reservations in full and decrements onHand", async () => {
  ctx = await setupInventory();
  const { skuId, componentItemIds } = await createMtoSku(ctx, [{ onHand: 100, quantityPerUnit: 2 }]);
  skuIds = [skuId];
  const { fulfillment, fulfillmentItemId } = await createFulfillment(ctx, skuId, 3);
  await reserveFulfillment(fulfillment.id);

  await consumeForProduction(fulfillment.id);
  await consumeForProduction(fulfillment.id);

  const reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { fulfillmentItemId } });
  assert.equal(reservation.status, "CONSUMED");
  assert.equal(reservation.consumedQuantity.toString(), "6");
  const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId: ctx.facilityId, inventoryItemId: componentItemIds[0] } });
  assert.equal(balance.onHand.toString(), "94");
  assert.equal(balance.reserved.toString(), "0");
  assert.equal(await prisma.inventoryMovement.count({ where: { reservationId: reservation.id, reason: "CONSUME" } }), 1);
});

test("consumeForShipment consumes only the newly shipped delta across partial shipments", async () => {
  ctx = await setupInventory();
  const skuId = await createFromStockSku(ctx, 10);
  skuIds = [skuId];
  const { fulfillment, fulfillmentItemId } = await createFulfillment(ctx, skuId, 5);
  await reserveFulfillment(fulfillment.id);
  const shipment = await prisma.shipment.create({ data: { fulfillmentId: fulfillment.id, provider: "manual" } });
  await prisma.shipmentItem.create({ data: { shipmentId: shipment.id, fulfillmentId: fulfillment.id, fulfillmentItemId, quantity: 2 } });

  await consumeForShipment(fulfillment.id);

  let reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { fulfillmentItemId } });
  assert.equal(reservation.status, "ACTIVE");
  assert.equal(reservation.consumedQuantity.toString(), "2");
  let balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId: ctx.facilityId, inventoryItemId: skuId } });
  assert.equal(balance.onHand.toString(), "8");
  assert.equal(balance.reserved.toString(), "3");

  const secondShipment = await prisma.shipment.create({ data: { fulfillmentId: fulfillment.id, provider: "manual" } });
  await prisma.shipmentItem.create({ data: { shipmentId: secondShipment.id, fulfillmentId: fulfillment.id, fulfillmentItemId, quantity: 3 } });
  await consumeForShipment(fulfillment.id);

  reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { fulfillmentItemId } });
  assert.equal(reservation.status, "CONSUMED");
  assert.equal(reservation.consumedQuantity.toString(), "5");
  balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { facilityId: ctx.facilityId, inventoryItemId: skuId } });
  assert.equal(balance.onHand.toString(), "5");
  assert.equal(balance.reserved.toString(), "0");
  assert.equal(await prisma.inventoryMovement.count({ where: { fulfillmentId: fulfillment.id, reason: "CONSUME" } }), 2);
});
