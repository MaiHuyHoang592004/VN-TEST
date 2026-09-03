/**
 * The assignment money path. These are the assertions that must be green
 * before any order UI exists, because every one of them describes a way the
 * legacy system lost real money:
 *
 *   • it charged inside an unawaited forEach, so a seller with five orders was
 *     billed for roughly one;
 *   • it wrote balances with no transaction and no ledger column, so nothing
 *     could reconcile afterwards;
 *   • it had no idempotency, so a double-clicked Assign charged twice;
 *   • it never checked whether an order had already been paid for.
 *
 * Integration, not unit: the guarantees are database behaviour — column locks and
 * a UNIQUE constraint — and a mocked client would pass with all of it deleted.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, Prisma, type UserRole } from "@opcreative/db";
import { assignOrders, createOrder, updateStatus } from "./service.ts";

let adminId: string;
let sellerA: string;
let sellerB: string;
let warehouseId: number;
let skuId: number;
let productId: number;
let variantId: number;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const ctx = () => ({ actor: admin(), ip: null, userAgent: null });

/** An order for `seller`, PENDING and ready to assign. */
async function makeOrder(seller: string, quantity = 1) {
  const r = await createOrder(admin(), {
    externalId: `om-${Math.abs(seller.length * 7 + quantity)}-${Date.now()}${Math.trunc(performance.now() * 1000) % 1000}`,
    productVariantId: skuId,
    quantity,
    placedAt: new Date(),
    shippingName: "Test Recipient",
    zip: "10001",
  }, ctx(), seller);
  assert.equal(r.ok, true, "fixture order must be created");
  return r.ok === true ? r.id : 0;
}

const balanceOf = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { balance: true } })).balance;

before(async () => {
  const [a, s1, s2] = await Promise.all([
    prisma.user.create({ data: { email: "om-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({
      data: { email: "om-a@test.local", roles: ["SELLER"], tier: 1, balance: new Prisma.Decimal("100.00") },
    }),
    prisma.user.create({
      data: { email: "om-b@test.local", roles: ["SELLER"], balance: new Prisma.Decimal("5.00") },
    }),
  ]);
  adminId = a.id;
  sellerA = s1.id;
  sellerB = s2.id;

  const wh = await prisma.customer.create({
    data: { code: "OMTEST", name: "Money Test Site", timezone: "UTC", status: "ACTIVE" },
  });
  warehouseId = wh.id;

  const p = await prisma.variant.create({ data: { name: "Money Wallet", key: "om-wallet", status: "ACTIVE" } });
  const v = await prisma.product.create({ data: { name: "Money Brown", key: "om-brown" } });
  productId = p.id;
  variantId = v.id;
  const sku = await prisma.productVariant.create({
    data: { productId: p.id, variantId: v.id, salePrice: new Prisma.Decimal("30.00") },
  });
  skuId = sku.id;
  // tier 0 = 12.50 (what sellerB, untiered, pays), tier 1 = 10.00 (sellerA).
  await prisma.variantPrice.createMany({
    data: [
      { productVariantId: sku.id, tier: 0, price: new Prisma.Decimal("12.50") },
      { productVariantId: sku.id, tier: 1, price: new Prisma.Decimal("10.00") },
    ],
  });
});

after(async () => {
  const ids = [adminId, sellerA, sellerB];
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.transaction.deleteMany({ where: { userId: { in: ids } } });
  const orders = await prisma.order.findMany({ where: { customerId: { in: ids } }, select: { id: true, shippingAddressId: true } });
  await prisma.order.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.address.deleteMany({
    where: { id: { in: orders.map((o) => o.shippingAddressId).filter((x): x is number => x !== null) } },
  });
  await prisma.variantPrice.deleteMany({ where: { productVariantId: skuId } });
  await prisma.productVariant.deleteMany({ where: { id: skuId } });
  await prisma.variant.deleteMany({ where: { id: productId } });
  await prisma.product.deleteMany({ where: { id: variantId } });
  await prisma.customer.deleteMany({ where: { id: warehouseId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

test("a seller is charged their TIER price times quantity, once per order", async () => {
  // The legacy failure in one assertion: three orders, one seller, one batch.
  // The unawaited forEach charged for about one of them.
  const ids = [await makeOrder(sellerA, 1), await makeOrder(sellerA, 2), await makeOrder(sellerA, 1)];
  const before = await balanceOf(sellerA);

  const r = await assignOrders(admin(), { orderIds: ids, warehouseId, idempotencyKey: "om-batch-1" }, ctx());
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.assigned, 3);

  // tier 1 = 10.00 → (1 + 2 + 1) × 10.00 = 40.00, not 10.00.
  const after = await balanceOf(sellerA);
  assert.equal(before.sub(after).toFixed(2), "40.00");

  const orders = await prisma.order.findMany({ where: { id: { in: ids } }, select: { status: true, baseCost: true, warehouseId: true, assignedAt: true, paid: true } });
  assert.ok(orders.every((o) => o.status === "ASSIGNED"), "every order moved");
  assert.ok(orders.every((o) => o.warehouseId === warehouseId && o.assignedAt && o.paid));
  assert.deepEqual(
    orders.map((o) => o.baseCost?.toFixed(2)).sort(),
    ["10.00", "10.00", "20.00"],
    "each order records what IT cost, not the batch total",
  );

  // Money left the seller's balance without them acting. One notification for
  // the batch, not three — the charge is a single move.
  const told = await prisma.notification.findMany({
    where: { userId: sellerA, type: "ORDER_ASSIGNED" },
  });
  assert.equal(told.length, 1, "one notification for the batch");
  assert.equal((told[0].data as { amount?: string } | null)?.amount, "40.00");
});

test("balance and ledger move together, and only once per key", async () => {
  const ids = [await makeOrder(sellerA, 1)];
  const before = await balanceOf(sellerA);

  const first = await assignOrders(admin(), { orderIds: ids, warehouseId, idempotencyKey: "om-dupe-key" }, ctx());
  assert.equal(first.ok === true && first.assigned, 1);
  const mid = await balanceOf(sellerA);
  assert.equal(before.sub(mid).toFixed(2), "10.00");

  // The double-click. Same key, same orders — must be a no-op.
  const second = await assignOrders(admin(), { orderIds: ids, warehouseId, idempotencyKey: "om-dupe-key" }, ctx());
  assert.equal(second.ok, true);
  assert.equal((await balanceOf(sellerA)).toFixed(2), mid.toFixed(2), "no second charge");

  const ledger = await prisma.transaction.findMany({
    where: { userId: sellerA, idempotencyKey: { startsWith: "assign:om-dupe-key" } },
  });
  assert.equal(ledger.length, 1, "exactly one ledger column for the key");
  assert.equal(ledger[0].type, "ORDER_PAYMENT");
  assert.equal(ledger[0].amount.toFixed(2), "-10.00", "a charge is negative");
  assert.equal(ledger[0].balanceBefore?.toFixed(2), before.toFixed(2));
  assert.equal(ledger[0].balanceAfter?.toFixed(2), mid.toFixed(2), "the ledger explains the balance");
});

test("an already-assigned order is skipped, never charged twice", async () => {
  const id = await makeOrder(sellerA, 1);
  await assignOrders(admin(), { orderIds: [id], warehouseId, idempotencyKey: "om-first-key" }, ctx());
  const afterFirst = await balanceOf(sellerA);

  // A DIFFERENT key — so idempotency cannot be what saves us here. The status
  // check is. This is the "assign the same order in two batches" mistake.
  const again = await assignOrders(admin(), { orderIds: [id], warehouseId, idempotencyKey: "om-second" }, ctx());
  assert.equal(again.ok, true);
  assert.equal(again.ok === true && again.assigned, 0, "nothing to assign");
  assert.equal(again.ok === true && again.skipped, 1);
  assert.equal((await balanceOf(sellerA)).toFixed(2), afterFirst.toFixed(2), "not re-charged");
});

test("an unaffordable batch is rejected WHOLE — no partial assignment", async () => {
  // sellerB has 5.00 and is untiered, so pays tier 0 (12.50). Two orders = 25.
  const ids = [await makeOrder(sellerB, 1), await makeOrder(sellerB, 1)];
  const before = await balanceOf(sellerB);

  const r = await assignOrders(admin(), { orderIds: ids, warehouseId, idempotencyKey: "om-poor-key" }, ctx());
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.error, "insufficient-balance");

  assert.equal((await balanceOf(sellerB)).toFixed(2), before.toFixed(2), "balance untouched");
  const orders = await prisma.order.findMany({ where: { id: { in: ids } }, select: { status: true } });
  assert.ok(orders.every((o) => o.status === "PENDING"), "no order moved");
  const ledger = await prisma.transaction.findMany({ where: { userId: sellerB } });
  assert.equal(ledger.length, 0, "and no ledger column was left behind");
});

test("one batch spanning two sellers charges each their own price", async () => {
  await prisma.user.update({ where: { id: sellerB }, data: { balance: new Prisma.Decimal("100.00") } });
  const ids = [await makeOrder(sellerA, 1), await makeOrder(sellerB, 1)];
  const [beforeA, beforeB] = await Promise.all([balanceOf(sellerA), balanceOf(sellerB)]);

  const r = await assignOrders(admin(), { orderIds: ids, warehouseId, idempotencyKey: "om-mixed-key" }, ctx());
  assert.equal(r.ok === true && r.assigned, 2);

  const [afterA, afterB] = await Promise.all([balanceOf(sellerA), balanceOf(sellerB)]);
  assert.equal(beforeA.sub(afterA).toFixed(2), "10.00", "tier 1 seller pays 10.00");
  assert.equal(beforeB.sub(afterB).toFixed(2), "12.50", "untiered seller pays the base price");
});

test("a status move outside the map is refused with a stable code", async () => {
  const id = await makeOrder(sellerA, 1);
  // PENDING may only become ASSIGNED, ON_HOLD or CANCELLED. Not SHIPPED.
  await assert.rejects(
    () => updateStatus(admin(), id, "SHIPPED", ctx()),
    (e: Error & { code?: string }) => e.code === "invalid-transition",
  );
  const column = await prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } });
  assert.equal(column.status, "PENDING", "the rejected move changed nothing");
});

test("a held order resumes to where it was held from", async () => {
  const id = await makeOrder(sellerA, 1);
  await assignOrders(admin(), { orderIds: [id], warehouseId, idempotencyKey: `om-hold-${id}` }, ctx());
  await updateStatus(admin(), id, "ON_HOLD", ctx(), "warehouse queried the address");

  // Back to ASSIGNED, the status it was held from — not to PENDING, which
  // would lose its place and, worse, invite a second charge.
  const r = await updateStatus(admin(), id, "ASSIGNED", ctx());
  assert.equal(r.ok, true);
  const column = await prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } });
  assert.equal(column.status, "ASSIGNED");
});
