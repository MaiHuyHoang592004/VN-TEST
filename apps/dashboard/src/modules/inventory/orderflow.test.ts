/**
 * The order-flow lifecycle: assignment holds stock, production takes it,
 * cancellation gives it back.
 *
 * This suite flips INVENTORY_ORDER_FLOW on. The FIRST test asserts what the
 * rest of the app sees with it off — every other suite in this repo runs
 * without it, and their continued green is the real regression check.
 *
 * The cases that only exist because of concurrency (double-reserve on one
 * unit) are the reason this runs against a real database.
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@gwprint/db";

import {
  consumeForOrder,
  createBom,
  recordShortage,
  releaseForOrder,
  reserveForOrder,
} from "./boms/service.ts";
import { quickImport } from "./stock/service.ts";

let adminId: string;
let sellerId: string;
let warehouseId: number;
let productId: number;
let seq = 0;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const ctx = () => ({ actor: admin(), ip: null, userAgent: null });
const codeOf = (e: unknown) => (e as { code?: string }).code;

const withFlag = <T>(value: string | undefined, fn: () => Promise<T>) => {
  const previous = process.env.INVENTORY_ORDER_FLOW;
  if (value === undefined) delete process.env.INVENTORY_ORDER_FLOW;
  else process.env.INVENTORY_ORDER_FLOW = value;
  return fn().finally(() => {
    if (previous === undefined) delete process.env.INVENTORY_ORDER_FLOW;
    else process.env.INVENTORY_ORDER_FLOW = previous;
  });
};

async function newMaterial(sku: string, stock: number) {
  const m = await prisma.material.create({ data: { sku, name: `Material ${sku}` } });
  if (stock > 0) {
    await prisma.materialStock.create({
      data: { warehouseId, materialId: m.id, quantity: stock },
    });
  }
  return m.id;
}

/** A SKU with an ACTIVE recipe of `perUnit` of one material. */
async function newSkuWithBom(sku: string, materialId: number, perUnit: number) {
  seq += 1;
  const variant = await prisma.variant.create({
    data: { name: `OF variant ${seq}`, key: `of-variant-${seq}` },
  });
  const pv = await prisma.productVariant.create({
    data: { productId, variantId: variant.id, sku },
  });
  await createBom(
    admin(),
    pv.id,
    {
      name: `${sku} BOM`,
      status: "ACTIVE",
      lines: [
        {
          materialId,
          componentSku: `C-${materialId}`,
          quantityPerUnit: perUnit,
          unit: "pcs",
          wastageRate: 0,
          stage: "PRODUCTION",
          required: true,
          sortOrder: 0,
        },
      ],
    },
    ctx(),
  );
  return pv.id;
}

async function newOrder(productVariantId: number, quantity: number) {
  const order = await prisma.order.create({
    data: {
      quantity,
      placedAt: new Date(),
      warehouseId,
      productVariantId,
      customerId: sellerId,
      status: "ASSIGNED",
    },
    select: { id: true },
  });
  return order.id;
}

const counters = async (materialId: number) =>
  prisma.materialStock.findUniqueOrThrow({
    where: { warehouseId_materialId: { warehouseId, materialId } },
    select: { quantity: true, reserved: true, needed: true },
  });

before(async () => {
  const [a, s] = await Promise.all([
    prisma.user.create({ data: { email: "of-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "of-seller@test.local", roles: ["SELLER"] } }),
  ]);
  adminId = a.id;
  sellerId = s.id;

  const w = await prisma.warehouse.create({ data: { code: "OF-A", name: "Order flow site" } });
  warehouseId = w.id;

  const p = await prisma.product.create({ data: { name: "OF product", key: "of-product" } });
  productId = p.id;
});

after(() => {
  delete process.env.INVENTORY_ORDER_FLOW;
});

// ── The switch ───────────────────────────────────────────────────────────────

test("with the flag OFF all three are no-ops", async () => {
  // This is what every other suite in the repo runs under. If this ever fails,
  // shipping doc 06 changed how orders behave — which it must not, until the
  // counts are trusted after the cutover.
  const m = await newMaterial("OF-FLAGOFF", 100);
  const pv = await newSkuWithBom("OF-SKU-FLAGOFF", m, 2);
  const orderId = await newOrder(pv, 3);

  await withFlag(undefined, async () => {
    const reserved = await prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId));
    assert.equal(reserved.reserved, 0);
    await prisma.$transaction((tx) => consumeForOrder(tx, orderId, adminId));
    await prisma.$transaction((tx) => releaseForOrder(tx, orderId, adminId));
  });

  assert.deepEqual(await counters(m), { quantity: 100, reserved: 0, needed: 0 });
  assert.equal(await prisma.inventoryReservation.count({ where: { orderId } }), 0);
  assert.equal(await prisma.inventoryMovement.count({ where: { orderId } }), 0);
});

// ── Reserve ──────────────────────────────────────────────────────────────────

test("reserving holds stock WITHOUT taking it off the shelf", async () => {
  // The counter convention §0b picked: quantity includes reserved. Legacy's
  // two services disagreed about this, which is why it gets its own test.
  const m = await newMaterial("OF-RESERVE", 50);
  const pv = await newSkuWithBom("OF-SKU-RESERVE", m, 2);
  const orderId = await newOrder(pv, 5);

  await withFlag("1", () => prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId)));

  assert.deepEqual(await counters(m), { quantity: 50, reserved: 10, needed: 0 });
  const reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId } });
  assert.equal(reservation.quantity, 10);
  assert.equal(reservation.status, "RESERVED");
});

test("reserving twice for one order is a no-op, not a second helping", async () => {
  const m = await newMaterial("OF-IDEMPOTENT", 50);
  const pv = await newSkuWithBom("OF-SKU-IDEMPOTENT", m, 2);
  const orderId = await newOrder(pv, 3);

  await withFlag("1", async () => {
    await prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId));
    const second = await prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId));
    assert.equal(second.reserved, 0);
  });

  assert.equal((await counters(m)).reserved, 6, "held once");
  assert.equal(await prisma.inventoryReservation.count({ where: { orderId } }), 1);
});

test("a shortage fails the assignment and names the items", async () => {
  const m = await newMaterial("OF-SHORT", 3);
  const pv = await newSkuWithBom("OF-SKU-SHORT", m, 2);
  const orderId = await newOrder(pv, 5); // needs 10, has 3

  await withFlag("1", async () => {
    await assert.rejects(
      () => prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId)),
      (e: Error & { detail?: { items?: { sku: string; required: number }[] } }) => {
        assert.equal(codeOf(e), "insufficient-stock");
        assert.equal(e.detail?.items?.[0]?.required, 10, "and says how many were needed");
        return true;
      },
    );
  });

  assert.deepEqual(await counters(m), { quantity: 3, reserved: 0, needed: 0 });
  assert.equal(
    await prisma.inventoryReservation.count({ where: { orderId } }),
    0,
    "the failed reservation left nothing behind",
  );
});

test("CONCURRENT reservations on one unit: exactly one wins", async () => {
  // The guarded UPDATE is the only thing deciding this. Sequentially both
  // orderings pass — the second simply fails the advisory check — so this is
  // the case that proves the WHERE clause and not the read.
  const m = await newMaterial("OF-RACE", 1);
  const pvA = await newSkuWithBom("OF-SKU-RACE-A", m, 1);
  const pvB = await newSkuWithBom("OF-SKU-RACE-B", m, 1);
  const orderA = await newOrder(pvA, 1);
  const orderB = await newOrder(pvB, 1);

  const results = await withFlag("1", () =>
    Promise.allSettled([
      prisma.$transaction((tx) => reserveForOrder(tx, orderA, adminId)),
      prisma.$transaction((tx) => reserveForOrder(tx, orderB, adminId)),
    ]),
  );

  const won = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(won, 1, "one unit, one winner");
  const column = await counters(m);
  assert.equal(column.reserved, 1, "and reserved never exceeds what is on the shelf");
  assert.ok(column.reserved <= column.quantity);
});

// ── Consume ──────────────────────────────────────────────────────────────────

test("consuming moves onHand and reserved together, and is idempotent", async () => {
  const m = await newMaterial("OF-CONSUME", 20);
  const pv = await newSkuWithBom("OF-SKU-CONSUME", m, 2);
  const orderId = await newOrder(pv, 4); // 8 units

  await withFlag("1", async () => {
    await prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId));
    assert.deepEqual(await counters(m), { quantity: 20, reserved: 8, needed: 0 });

    await prisma.$transaction((tx) => consumeForOrder(tx, orderId, adminId));
    assert.deepEqual(
      await counters(m),
      { quantity: 12, reserved: 0, needed: 0 },
      "both counters move in one statement — never one without the other",
    );

    const again = await prisma.$transaction((tx) => consumeForOrder(tx, orderId, adminId));
    assert.equal(again.consumed, 0, "a re-scan does not consume twice");
  });

  assert.deepEqual(await counters(m), { quantity: 12, reserved: 0, needed: 0 });
  const move = await prisma.inventoryMovement.findFirstOrThrow({
    where: { orderId, type: "CONSUME" },
    select: { quantity: true },
  });
  assert.equal(move.quantity, -8, "consumption carries the minus sign (§0b)");
});

test("CONCURRENT consumes of one order take the stock exactly once", async () => {
  // Doc 06's done-check names double-consume alongside double-receive and
  // double-reserve, and for the same reason: the sequential version passes
  // with the guard deleted. Two scans of one order landing together must move
  // the shelf once, not twice.
  const m = await newMaterial("OF-CONSUME-RACE", 20);
  const pv = await newSkuWithBom("OF-SKU-CONSUME-RACE", m, 2);
  const orderId = await newOrder(pv, 4); // 8 units

  await withFlag("1", async () => {
    await prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId));

    const consume = () => prisma.$transaction((tx) => consumeForOrder(tx, orderId, adminId));
    const results = await Promise.allSettled([consume(), consume()]);
    assert.equal(
      results.filter((r) => r.status === "fulfilled").length,
      1,
      "exactly one consume succeeded",
    );
  });

  assert.deepEqual(
    await counters(m),
    { quantity: 12, reserved: 0, needed: 0 },
    "the shelf moved once — 20 less 8, not less 16",
  );
  const moves = await prisma.inventoryMovement.count({
    where: { orderId, type: "CONSUME" },
  });
  assert.equal(moves, 1, "and the ledger records one consumption");
});

// ── The shortage backlog ─────────────────────────────────────────────────────

test("a failed assignment records what was missing, exactly once", async () => {
  // The other half of doc 06's done-check. reserveForOrder THROWS on a
  // shortage, so anything it wrote would roll back with the caller's
  // transaction — recordShortage runs afterwards, on its own, which is what
  // makes "we are short 7" survive the failure and reach the buyer's tile.
  const m = await newMaterial("OF-BACKLOG", 3);
  const pv = await newSkuWithBom("OF-SKU-BACKLOG", m, 2);
  const orderId = await newOrder(pv, 5); // needs 10, has 3

  await withFlag("1", async () => {
    const failure = await prisma
      .$transaction((tx) => reserveForOrder(tx, orderId, adminId))
      .then(() => null)
      .catch((e: Error & { detail?: { items?: { ref: unknown; shortage: number }[] } }) => e);

    assert.ok(failure, "the reservation failed");
    assert.equal(codeOf(failure), "insufficient-stock");
    assert.equal((await counters(m)).needed, 0, "and the rollback took its writes with it");

    const items = (failure.detail?.items ?? []) as { ref: never; shortage: number }[];
    assert.equal(items[0]?.shortage, 7, "the error carries the shortfall: 10 needed, 3 on hand");

    // This is the call assign makes in its catch.
    await prisma.$transaction((tx) => recordShortage(tx, orderId, items, adminId));
    assert.equal((await counters(m)).needed, 7);

    // A retried assignment must not stack the same shortage again.
    await prisma.$transaction((tx) => recordShortage(tx, orderId, items, adminId));
    assert.equal((await counters(m)).needed, 7, "recorded once per order per item, not twice");
  });

  const needed = await prisma.inventoryMovement.count({
    where: { orderId, type: "NEEDED" },
  });
  assert.equal(needed, 1, "and exactly one NEEDED movement explains it");
});

test("the backlog clears itself when the missing stock arrives", async () => {
  // The shortage tile going red is only useful if it goes green again without
  // anyone clicking. quickImport → resolveNeeded is the path that does it.
  const m = await newMaterial("OF-BACKLOG-HEAL", 0);
  const pv = await newSkuWithBom("OF-SKU-BACKLOG-HEAL", m, 1);
  const orderId = await newOrder(pv, 4);

  await withFlag("1", async () => {
    const failure = await prisma
      .$transaction((tx) => reserveForOrder(tx, orderId, adminId))
      .then(() => null)
      .catch((e: Error & { detail?: { items?: unknown[] } }) => e);
    const items = (failure?.detail?.items ?? []) as { ref: never; shortage: number }[];
    await prisma.$transaction((tx) => recordShortage(tx, orderId, items, adminId));
    assert.equal((await counters(m)).needed, 4);

    await quickImport(
      admin(),
      { itemType: "MATERIAL", itemId: m, warehouseId, quantity: 4, note: "Restock" },
      ctx(),
    );
    assert.equal((await counters(m)).needed, 0, "the shortage settles itself");

    // And the order can now be assigned, which is the whole point.
    const ok = await prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId));
    assert.equal(ok.reserved, 4);
  });
});

// ── Release ──────────────────────────────────────────────────────────────────

test("cancelling after RESERVE drops the hold; the shelf never changed", async () => {
  const m = await newMaterial("OF-RELEASE", 30);
  const pv = await newSkuWithBom("OF-SKU-RELEASE", m, 3);
  const orderId = await newOrder(pv, 2); // 6 units

  await withFlag("1", async () => {
    await prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId));
    await prisma.$transaction((tx) => releaseForOrder(tx, orderId, adminId));
  });

  assert.deepEqual(await counters(m), { quantity: 30, reserved: 0, needed: 0 });
  const reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId } });
  assert.equal(reservation.status, "RELEASED");
  assert.equal(
    await prisma.inventoryMovement.count({ where: { orderId, type: "RESERVE_RELEASE" } }),
    1,
  );
});

test("cancelling after CONSUME puts the stock back", async () => {
  const m = await newMaterial("OF-RETURN", 30);
  const pv = await newSkuWithBom("OF-SKU-RETURN", m, 3);
  const orderId = await newOrder(pv, 2); // 6 units

  await withFlag("1", async () => {
    await prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId));
    await prisma.$transaction((tx) => consumeForOrder(tx, orderId, adminId));
    assert.equal((await counters(m)).quantity, 24);

    await prisma.$transaction((tx) => releaseForOrder(tx, orderId, adminId));
  });

  assert.equal((await counters(m)).quantity, 30, "the units come back onto the shelf");
  const reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId } });
  assert.equal(reservation.status, "RETURNED", "returned, not released — it had already been taken");
  assert.equal(await prisma.inventoryMovement.count({ where: { orderId, type: "RETURN" } }), 1);
});

test("releasing twice is a no-op", async () => {
  const m = await newMaterial("OF-RELEASE-TWICE", 10);
  const pv = await newSkuWithBom("OF-SKU-RELEASE-TWICE", m, 1);
  const orderId = await newOrder(pv, 2);

  await withFlag("1", async () => {
    await prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId));
    await prisma.$transaction((tx) => releaseForOrder(tx, orderId, adminId));
    const again = await prisma.$transaction((tx) => releaseForOrder(tx, orderId, adminId));
    assert.equal(again.released, 0);
  });

  assert.deepEqual(await counters(m), { quantity: 10, reserved: 0, needed: 0 });
});

// ── Finished goods ───────────────────────────────────────────────────────────

test("a SKU with no BOM reserves ITSELF — the finished-goods path", async () => {
  seq += 1;
  const variant = await prisma.variant.create({
    data: { name: "OF plain", key: `of-plain-${seq}` },
  });
  const pv = await prisma.productVariant.create({
    data: { productId, variantId: variant.id, sku: "OF-SKU-PLAIN" },
  });
  await prisma.warehouseInventory.create({
    data: { warehouseId, productVariantId: pv.id, quantity: 10 },
  });
  const orderId = await newOrder(pv.id, 4);

  await withFlag("1", () => prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId)));

  const column = await prisma.warehouseInventory.findUniqueOrThrow({
    where: { warehouseId_productVariantId: { warehouseId, productVariantId: pv.id } },
    select: { quantity: true, reserved: true },
  });
  assert.deepEqual(column, { quantity: 10, reserved: 4 }, "no recipe, one for one");
});

// ── The shortage backlog ─────────────────────────────────────────────────────

test("an unmapped required component blocks reservation with its own code", async () => {
  const m = await newMaterial("OF-UNMAPPED", 100);
  seq += 1;
  const variant = await prisma.variant.create({
    data: { name: "OF unmapped", key: `of-unmapped-${seq}` },
  });
  const pv = await prisma.productVariant.create({
    data: { productId, variantId: variant.id, sku: "OF-SKU-UNMAPPED" },
  });
  await createBom(
    admin(),
    pv.id,
    {
      name: "v1",
      status: "ACTIVE",
      lines: [
        {
          materialId: m,
          componentSku: "C-ok",
          quantityPerUnit: 1,
          unit: "pcs",
          wastageRate: 0,
          stage: "PRODUCTION",
          required: true,
          sortOrder: 0,
        },
        {
          materialId: null,
          componentSku: "C-mystery",
          quantityPerUnit: 1,
          unit: "pcs",
          wastageRate: 0,
          stage: "PRODUCTION",
          required: true,
          sortOrder: 1,
        },
      ],
    },
    ctx(),
  );
  const orderId = await newOrder(pv.id, 1);

  await withFlag("1", async () => {
    await assert.rejects(
      () => prisma.$transaction((tx) => reserveForOrder(tx, orderId, adminId)),
      (e: Error) => codeOf(e) === "bom-line-unmapped",
    );
  });
  assert.equal((await counters(m)).reserved, 0, "and nothing was held for the half it could map");
});
