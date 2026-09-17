import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma, Prisma } from "@fulfillflow/db";
import { incrementReserved, decrementReserved, decrementOnHandAndReserved } from "@fulfillflow/core";
import { reconcileBalance, reconcileAllBalances } from "./inventory-reconcile.service.js";

async function makeItem(label: string) {
  const facility = await prisma.facility.create({ data: { code: `m6-recon-${label}-${crypto.randomUUID()}`, name: label, countryCode: "US" } });
  const item = await prisma.inventoryItem.create({ data: { code: `m6-recon-item-${label}-${crypto.randomUUID()}`, name: label, kind: "RAW_MATERIAL" } });
  return { facilityId: facility.id, inventoryItemId: item.id };
}
async function cleanup(ctx: { facilityId: string; inventoryItemId: string }) {
  await prisma.exceptionCase.deleteMany({ where: { subjectKey: `inventory:${ctx.facilityId}:${ctx.inventoryItemId}` } });
  await prisma.inventoryMovement.deleteMany({ where: { facilityId: ctx.facilityId } });
  await prisma.inventoryBalance.deleteMany({ where: { facilityId: ctx.facilityId } });
  await prisma.inventoryItem.delete({ where: { id: ctx.inventoryItemId } });
  await prisma.facility.delete({ where: { id: ctx.facilityId } });
}

test("no drift when the balance already matches the ledger's summed deltas", async () => {
  const ctx = await makeItem("match");
  try {
    await prisma.inventoryBalance.create({ data: { facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId, onHand: 10, reserved: 3 } });
    await prisma.inventoryMovement.create({ data: { facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId, reason: "RECEIPT", onHandDelta: 10 } });
    await prisma.inventoryMovement.create({ data: { facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId, reason: "RESERVE", reservedDelta: 3 } });

    const result = await reconcileBalance(ctx.facilityId, ctx.inventoryItemId);
    assert.equal(result.drift, false);
  } finally {
    await cleanup(ctx);
  }
});

test("drift is detected, logged, and (when a tenant can be resolved) opens one INTERNAL LEDGER_DRIFT exception; a later match resolves it", async () => {
  const slug = `m6-recon-org-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: { organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com` } });
  const product = await prisma.product.create({ data: { name: slug, handle: slug } });
  const ctx = await makeItem("drift");
  const sku = await prisma.sku.create({ data: { id: ctx.inventoryItemId, productId: product.id } });
  const order = await prisma.order.create({ data: {
    organizationId: org.id, storeId: store.id, externalId: crypto.randomUUID(), sourceKey: `test:${crypto.randomUUID()}`,
    currency: "USD", placedAt: new Date(), items: { create: [{ skuId: sku.id, title: "item", quantity: 1 }] },
  }, include: { items: true } });
  const fulfillment = await prisma.fulfillment.create({ data: { orderId: order.id, facilityId: ctx.facilityId, status: "QUEUED" } });

  try {
    // Balance says onHand=10, but the ledger only ever recorded a +5 receipt tied to this fulfillment.
    await prisma.inventoryBalance.create({ data: { facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId, onHand: 10 } });
    await prisma.inventoryMovement.create({ data: {
      facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId, reason: "RECEIPT", onHandDelta: 5, fulfillmentId: fulfillment.id,
    } });

    const drifted = await reconcileBalance(ctx.facilityId, ctx.inventoryItemId);
    assert.equal(drifted.drift, true);
    assert.equal(drifted.expectedOnHand.toString(), "5");
    assert.equal(drifted.actualOnHand.toString(), "10");

    const exception = await prisma.exceptionCase.findFirstOrThrow({ where: { subjectKey: `inventory:${ctx.facilityId}:${ctx.inventoryItemId}`, code: "LEDGER_DRIFT", status: "OPEN" } });
    assert.equal(exception.organizationId, org.id);
    assert.equal(exception.visibility, "INTERNAL");
    assert.equal(exception.fulfillmentId, fulfillment.id);

    // Re-running while still drifted does not open a second OPEN exception (openException's own guard).
    await reconcileBalance(ctx.facilityId, ctx.inventoryItemId);
    const stillOne = await prisma.exceptionCase.count({ where: { subjectKey: `inventory:${ctx.facilityId}:${ctx.inventoryItemId}`, code: "LEDGER_DRIFT", status: "OPEN" } });
    assert.equal(stillOne, 1);

    // Correct the balance to match the ledger: drift clears and the exception resolves.
    await prisma.inventoryBalance.update({ where: { facilityId_inventoryItemId: { facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId } }, data: { onHand: 5 } });
    const fixed = await reconcileBalance(ctx.facilityId, ctx.inventoryItemId);
    assert.equal(fixed.drift, false);
    const resolved = await prisma.exceptionCase.findFirstOrThrow({ where: { subjectKey: `inventory:${ctx.facilityId}:${ctx.inventoryItemId}`, code: "LEDGER_DRIFT" } });
    assert.equal(resolved.status, "RESOLVED");
  } finally {
    // The exception references this fulfillment/order — delete it first, or
    // deleting its parent rows nulls out the FK one at a time (Postgres
    // ON DELETE SET NULL for these optional relations); once both are null
    // the row left behind trips exception_has_subject itself.
    await prisma.exceptionCase.deleteMany({ where: { subjectKey: `inventory:${ctx.facilityId}:${ctx.inventoryItemId}` } });
    await prisma.fulfillmentItem.deleteMany({ where: { fulfillmentId: fulfillment.id } });
    await prisma.fulfillment.delete({ where: { id: fulfillment.id } });
    await prisma.order.deleteMany({ where: { id: order.id } });
    await prisma.sku.delete({ where: { id: sku.id } });
    await cleanup(ctx);
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.store.delete({ where: { id: store.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("reconcileAllBalances sweeps every InventoryBalance row", async () => {
  const a = await makeItem("sweep-a");
  const b = await makeItem("sweep-b");
  try {
    await prisma.inventoryBalance.create({ data: { facilityId: a.facilityId, inventoryItemId: a.inventoryItemId, onHand: 1 } });
    await prisma.inventoryBalance.create({ data: { facilityId: b.facilityId, inventoryItemId: b.inventoryItemId, onHand: 2 } });
    const results = await reconcileAllBalances();
    const pairs = new Set(results.map((r) => `${r.facilityId}:${r.inventoryItemId}`));
    assert.ok(pairs.has(`${a.facilityId}:${a.inventoryItemId}`));
    assert.ok(pairs.has(`${b.facilityId}:${b.inventoryItemId}`));
  } finally {
    await cleanup(a);
    await cleanup(b);
  }
});

test("property: a random sequence of receive/reserve/release/consume never drifts the ledger from the balance", async () => {
  const ctx = await makeItem("property");
  try {
    await prisma.inventoryBalance.create({ data: { facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId, onHand: 0, reserved: 0 } });

    async function receive(qty: number) {
      await prisma.$transaction(async (tx) => {
        await tx.inventoryBalance.update({ where: { facilityId_inventoryItemId: { facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId } }, data: { onHand: { increment: qty } } });
        await tx.inventoryMovement.create({ data: { facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId, reason: "RECEIPT", onHandDelta: new Prisma.Decimal(qty), idempotencyKey: `test-receive:${crypto.randomUUID()}` } });
      });
    }
    async function reserve(qty: number) {
      await prisma.$transaction(async (tx) => {
        await incrementReserved(tx, ctx.facilityId, ctx.inventoryItemId, new Prisma.Decimal(qty));
        await tx.inventoryMovement.create({ data: { facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId, reason: "RESERVE", reservedDelta: new Prisma.Decimal(qty), idempotencyKey: `test-reserve:${crypto.randomUUID()}` } });
      });
    }
    async function release(qty: number) {
      await prisma.$transaction(async (tx) => {
        await decrementReserved(tx, ctx.facilityId, ctx.inventoryItemId, new Prisma.Decimal(qty));
        await tx.inventoryMovement.create({ data: { facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId, reason: "RELEASE", reservedDelta: new Prisma.Decimal(-qty), idempotencyKey: `test-release:${crypto.randomUUID()}` } });
      });
    }
    async function consume(qty: number) {
      await prisma.$transaction(async (tx) => {
        await decrementOnHandAndReserved(tx, ctx.facilityId, ctx.inventoryItemId, new Prisma.Decimal(qty));
        await tx.inventoryMovement.create({ data: { facilityId: ctx.facilityId, inventoryItemId: ctx.inventoryItemId, reason: "CONSUME", onHandDelta: new Prisma.Decimal(-qty), reservedDelta: new Prisma.Decimal(-qty), idempotencyKey: `test-consume:${crypto.randomUUID()}` } });
      });
    }

    let onHand = 0, reserved = 0;
    const rand = (seed => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; })(42);
    for (let i = 0; i < 60; i++) {
      const roll = rand();
      if (roll < 0.4) {
        const qty = 1 + Math.floor(rand() * 5);
        await receive(qty);
        onHand += qty;
      } else if (roll < 0.7 && onHand - reserved > 0) {
        const qty = 1 + Math.floor(rand() * (onHand - reserved));
        await reserve(qty);
        reserved += qty;
      } else if (roll < 0.85 && reserved > 0) {
        const qty = 1 + Math.floor(rand() * reserved);
        await release(qty);
        reserved -= qty;
      } else if (reserved > 0) {
        const qty = 1 + Math.floor(rand() * reserved);
        await consume(qty);
        reserved -= qty;
        onHand -= qty;
      } else {
        continue;
      }
      const result = await reconcileBalance(ctx.facilityId, ctx.inventoryItemId);
      assert.equal(result.drift, false, `drift after step ${i} (op roll=${roll})`);
      assert.equal(result.actualOnHand.toString(), String(onHand));
      assert.equal(result.actualReserved.toString(), String(reserved));
    }
  } finally {
    await cleanup(ctx);
  }
});
