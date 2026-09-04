/**
 * The admin refund, against a real database.
 *
 * Two invariants, both about paying twice:
 *   · the same idempotency key credits ONCE, however many times it is sent;
 *   · an order that has already been refunded is skipped, not paid again.
 *
 * The concurrent case is the only test that exercises the UNIQUE constraint on
 * the ledger column — every sequential test below passes with it dropped.
 *
 * Run: npm run test:money -w @gwprint/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@gwprint/db";

import { adminRefundOrders, refundQuote } from "./service.ts";

let adminId: string;
let sellerAId: string;
let sellerBId: string;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[], email: "rf-admin@test.local" });
const seller = () => ({ id: sellerAId, roles: ["SELLER"] as UserRole[], email: "rf-a@test.local" });
const ctx = () => ({ actor: admin(), ip: null, userAgent: null });

const balanceOf = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { balance: true } })).balance.toFixed(2);

async function paidOrder(customerId: string, base: string, shipping?: string) {
  const order = await prisma.order.create({
    data: {
      quantity: 1,
      placedAt: new Date(),
      customerId,
      status: "ASSIGNED",
      paid: true,
      baseCost: base,
    },
    select: { id: true },
  });
  if (shipping) {
    await prisma.shipment.create({ data: { orderId: order.id, cost: shipping, provider: "test" } });
  }
  return order.id;
}

before(async () => {
  const [a, sa, sb] = await Promise.all([
    prisma.user.create({ data: { email: "rf-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "rf-a@test.local", roles: ["SELLER"] } }),
    prisma.user.create({ data: { email: "rf-b@test.local", roles: ["SELLER"] } }),
  ]);
  adminId = a.id;
  sellerAId = sa.id;
  sellerBId = sb.id;
});

test("a refund credits base cost + shipping and cancels the order", async () => {
  const order = await paidOrder(sellerAId, "20.00", "4.50");
  const before = await balanceOf(sellerAId);

  const result = await adminRefundOrders(
    admin(),
    { orderIds: [order], idempotencyKey: `t-simple-${order}` },
    ctx(),
  );

  assert.equal(result.refunded, 1);
  assert.equal(await balanceOf(sellerAId), (Number(before) + 24.5).toFixed(2));
  const column = await prisma.order.findUniqueOrThrow({
    where: { id: order },
    select: { status: true },
  });
  assert.equal(column.status, "CANCELLED", "a refunded order is not still in production");
});

test("one credit per SELLER, not one per order", async () => {
  const [a1, a2, b1] = await Promise.all([
    paidOrder(sellerAId, "10.00"),
    paidOrder(sellerAId, "15.00"),
    paidOrder(sellerBId, "7.00"),
  ]);

  const result = await adminRefundOrders(
    admin(),
    { orderIds: [a1, a2, b1], idempotencyKey: "t-grouped" },
    ctx(),
  );
  assert.equal(result.refunded, 3);
  assert.equal(result.credits.length, 2, "two sellers, two ledger moves");
  assert.deepEqual(
    result.credits.map((c) => c.amount).sort(),
    ["25.00", "7.00"],
  );
});

test("the same key twice credits once — including under a race", async () => {
  const order = await paidOrder(sellerAId, "12.00");
  const before = await balanceOf(sellerAId);
  const key = `t-idem-${order}`;

  // Sequential retry: the fast path sees the key and does nothing.
  await adminRefundOrders(admin(), { orderIds: [order], idempotencyKey: key }, ctx());
  await adminRefundOrders(admin(), { orderIds: [order], idempotencyKey: key }, ctx());
  assert.equal(await balanceOf(sellerAId), (Number(before) + 12).toFixed(2));

  // Concurrent double-click on a DIFFERENT order: both callers pass the
  // alreadyApplied check, and only the UNIQUE constraint stops the second.
  const racing = await paidOrder(sellerAId, "8.00");
  const beforeRace = await balanceOf(sellerAId);
  const raceKey = `t-race-${racing}`;
  await Promise.all([
    adminRefundOrders(admin(), { orderIds: [racing], idempotencyKey: raceKey }, ctx()),
    adminRefundOrders(admin(), { orderIds: [racing], idempotencyKey: raceKey }, ctx()),
  ]);
  assert.equal(await balanceOf(sellerAId), (Number(beforeRace) + 8).toFixed(2));
});

test("an already-refunded order is skipped, not paid twice", async () => {
  const order = await paidOrder(sellerAId, "30.00");
  await adminRefundOrders(admin(), { orderIds: [order], idempotencyKey: `t-once-${order}` }, ctx());
  const after = await balanceOf(sellerAId);

  // A NEW key — the idempotency guard cannot help here; the ledger check is
  // what does. This is the case a fresh key would defeat.
  const second = await adminRefundOrders(
    admin(),
    { orderIds: [order], idempotencyKey: `t-again-${order}` },
    ctx(),
  );
  assert.equal(second.refunded, 0);
  assert.equal(second.skipped, 1);
  assert.equal(await balanceOf(sellerAId), after, "the balance did not move a second time");
});

test("the quote a seller sees is the arithmetic the refund performs", async () => {
  const order = await paidOrder(sellerAId, "11.00", "2.25");
  const quote = await refundQuote(seller(), [order]);
  assert.equal(quote.total, "13.25");
  assert.equal(quote.lines[0]?.blocked, null);

  const before = await balanceOf(sellerAId);
  await adminRefundOrders(admin(), { orderIds: [order], idempotencyKey: `t-quote-${order}` }, ctx());
  assert.equal(await balanceOf(sellerAId), (Number(before) + 13.25).toFixed(2));

  // And afterwards the same quote says why it cannot happen again.
  const requote = await refundQuote(seller(), [order]);
  assert.equal(requote.lines[0]?.blocked, "cancelled");
  assert.equal(requote.total, "0.00");
});

test("a seller's quote cannot see another seller's order", async () => {
  const theirs = await paidOrder(sellerBId, "50.00");
  const quote = await refundQuote(seller(), [theirs]);
  assert.deepEqual(quote.lines, []);
  assert.equal(quote.unknown, 1, "counted, never described");
});
