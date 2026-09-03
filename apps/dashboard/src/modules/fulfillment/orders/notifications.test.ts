/**
 * WHO gets told WHAT.
 *
 * The routing is the whole feature: a seller must never receive a notification
 * meant for staff, the customer floor must not be told what a seller was
 * charged, and nobody should be notified about their own action. None of that
 * is visible from the notify() call sites alone — it only shows up when you ask
 * what actually landed in each person's panel, which is what this does.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, Prisma, type UserRole } from "@opcreative/db";
import { assignOrders, createOrder, updateStatus } from "./service.ts";

let adminId: string;
let supportId: string;
let sellerId: string;
let packerId: string;
let warehouseId: number;
let skuId: number;
let productId: number;
let variantId: number;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const ctx = () => ({ actor: admin(), ip: null, userAgent: null });

const inbox = async (userId: string) =>
  (await prisma.notification.findMany({ where: { userId }, select: { type: true } })).map(
    (n) => n.type,
  );

async function makeOrder(quantity = 1) {
  const r = await createOrder(admin(), {
    externalId: `nt-${quantity}-${Date.now()}${Math.trunc(performance.now() * 1000) % 1000}`,
    productVariantId: skuId,
    quantity,
    shippingName: "Test Recipient",
    zip: "10001",
  }, ctx(), sellerId);
  assert.equal(r.ok, true);
  return r.ok === true ? r.id : 0;
}

before(async () => {
  const [a, s, se, p] = await Promise.all([
    prisma.user.create({ data: { email: "nt-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "nt-support@test.local", roles: ["SUPPORT"] } }),
    prisma.user.create({
      data: { email: "nt-seller@test.local", roles: ["SELLER"], balance: new Prisma.Decimal("500.00") },
    }),
    prisma.user.create({ data: { email: "nt-packer@test.local", roles: ["WAREHOUSE"] } }),
  ]);
  adminId = a.id;
  supportId = s.id;
  sellerId = se.id;
  packerId = p.id;

  const wh = await prisma.warehouse.create({
    data: { code: "NTTEST", name: "Notify Site", timezone: "UTC", status: "ACTIVE" },
  });
  warehouseId = wh.id;
  await prisma.warehouseMember.create({ data: { userId: packerId, warehouseId } });

  const prod = await prisma.product.create({ data: { name: "Notify Wallet", key: "nt-wallet", status: "ACTIVE" } });
  const v = await prisma.variant.create({ data: { name: "Notify Brown", key: "nt-brown" } });
  productId = prod.id;
  variantId = v.id;
  const sku = await prisma.productVariant.create({
    data: { productId: prod.id, variantId: v.id, salePrice: new Prisma.Decimal("10.00") },
  });
  skuId = sku.id;
  await prisma.variantPrice.create({
    data: { productVariantId: sku.id, tier: 0, price: new Prisma.Decimal("10.00") },
  });
});

after(async () => {
  const ids = [adminId, supportId, sellerId, packerId];
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.transaction.deleteMany({ where: { userId: { in: ids } } });
  const orders = await prisma.order.findMany({ where: { customerId: { in: ids } }, select: { shippingAddressId: true } });
  await prisma.order.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.address.deleteMany({
    where: { id: { in: orders.map((o) => o.shippingAddressId).filter((x): x is number => x !== null) } },
  });
  await prisma.warehouseMember.deleteMany({ where: { warehouseId } });
  await prisma.variantPrice.deleteMany({ where: { productVariantId: skuId } });
  await prisma.productVariant.deleteMany({ where: { id: skuId } });
  await prisma.variant.deleteMany({ where: { id: productId } });
  await prisma.product.deleteMany({ where: { id: variantId } });
  await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

test("an order filed BY someone else tells the owner", async () => {
  await makeOrder();
  assert.ok((await inbox(sellerId)).includes("ORDER_CREATED"));
});

test("nobody is notified about their own action", async () => {
  // The admin created that order; being told about it would be a bell that
  // rings for what you just did.
  assert.equal((await inbox(adminId)).includes("ORDER_CREATED"), false);
});

test("assignment tells the seller the CHARGE and the floor the WORK", async () => {
  const id = await makeOrder(2);
  const r = await assignOrders(
    admin(),
    { orderIds: [id], warehouseId, idempotencyKey: `nt-assign-${id}` },
    ctx(),
  );
  assert.equal(r.ok, true);

  const seller = await inbox(sellerId);
  const packer = await inbox(packerId);

  assert.ok(seller.includes("ORDER_ASSIGNED"), "the seller is told they were charged");
  assert.ok(packer.includes("WORK_ASSIGNED"), "the site's rota is told work arrived");

  // The two must not cross. ORDER_ASSIGNED carries the amount charged, and
  // what a seller pays is not the packer's business.
  assert.equal(packer.includes("ORDER_ASSIGNED"), false, "the floor never sees the charge");
  assert.equal(seller.includes("WORK_ASSIGNED"), false, "the seller is not on the rota");
});

test("one batch is ONE notification for the floor, not one per order", async () => {
  const before = (await inbox(packerId)).filter((t) => t === "WORK_ASSIGNED").length;
  const ids = [await makeOrder(), await makeOrder(), await makeOrder()];
  await assignOrders(admin(), { orderIds: ids, warehouseId, idempotencyKey: `nt-batch-${ids[0]}` }, ctx());

  const after = (await inbox(packerId)).filter((t) => t === "WORK_ASSIGNED").length;
  assert.equal(after - before, 1, "three orders, one line in the panel");
});

test("ON_HOLD reaches everyone who can act on any order — and no seller", async () => {
  const id = await makeOrder();
  await updateStatus(admin(), id, "ON_HOLD", ctx(), "address looks wrong");

  // The audience is derived from orders.read.all, so SUPPORT is included
  // without this code naming a single role.
  assert.ok((await inbox(supportId)).includes("ORDER_ON_HOLD"), "support is told");

  const seller = await inbox(sellerId);
  assert.equal(
    seller.includes("ORDER_ON_HOLD"),
    false,
    "the seller does NOT get the staff alert",
  );
  // They get the seller-facing one instead — same event, different audience
  // and different wording.
  assert.ok(seller.includes("ORDER_STATUS_CHANGED"), "the seller is told their order stalled");
});

test("a packer, who cannot read all orders, is not sent the staff alert", async () => {
  // WAREHOUSE holds orders.read.customer, not .all — so it must fall outside
  // the ON_HOLD audience. This is the assertion that would fail if anyone
  // replaced the permission lookup with a hard-coded role list.
  assert.equal((await inbox(packerId)).includes("ORDER_ON_HOLD"), false);
});

test("routine internal steps do not notify the seller at all", async () => {
  const id = await makeOrder();
  await assignOrders(admin(), { orderIds: [id], warehouseId, idempotencyKey: `nt-quiet-${id}` }, ctx());
  const before = (await inbox(sellerId)).filter((t) => t === "ORDER_STATUS_CHANGED").length;

  // ASSIGNED → IN_PRODUCTION is the floor doing its job. A bell that rings at
  // every internal step is a bell people learn to ignore.
  await updateStatus(admin(), id, "IN_PRODUCTION", ctx());
  const after = (await inbox(sellerId)).filter((t) => t === "ORDER_STATUS_CHANGED").length;
  assert.equal(after, before, "no notification for an internal step");
});
