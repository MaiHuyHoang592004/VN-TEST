/**
 * What a seller may ask for, against a real database.
 *
 * The rule every test here defends: a REQUEST moves nothing. It creates a
 * PENDING column and stops — the doc 04 approve flow is the only thing that
 * touches a balance, and it does so exactly once. The two guards legacy lacked
 * are the cap (it accepted any number the form posted) and the duplicate check
 * (five requests for one parcel, all approvable).
 *
 * Run: npm run test:money -w @opcreative/dashboard (scratch DB, dropped after).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { prisma, type UserRole } from "@opcreative/db";

import { approveTransaction } from "../transactions/service.ts";
import { requestRefund, requestTopUp, RequestError } from "./service.ts";

let sellerId: string;
let adminId: string;
/** A paid order worth 30.00 (base 25 + shipping 5). */
let paidOrder: number;
/** A second paid order worth 10.00, kept for the duplicate-request case. */
let otherOrder: number;
/** Never charged — nothing to give back. */
let unpaidOrder: number;

const seller = () => ({ id: sellerId, roles: ["SELLER"] as UserRole[], email: "req-seller@test.local" });
const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[], email: "req-admin@test.local" });
const ctx = (a: { id: string; roles: UserRole[] }) => ({ actor: a, ip: null, userAgent: null });
const codeOf = (e: unknown) => (e as { code?: string }).code;

const balanceOf = async () =>
  (await prisma.user.findUniqueOrThrow({ where: { id: sellerId }, select: { balance: true } })).balance.toFixed(2);

async function newPaidOrder(base: string, shipping?: string) {
  const order = await prisma.order.create({
    data: {
      quantity: 1,
      placedAt: new Date(),
      customerId: sellerId,
      status: "ASSIGNED",
      paid: true,
      baseCost: base,
    },
    select: { id: true },
  });
  if (shipping) {
    await prisma.shipment.create({
      data: { orderId: order.id, cost: shipping, provider: "test" },
    });
  }
  return order.id;
}

before(async () => {
  const [s, a] = await Promise.all([
    prisma.user.create({ data: { email: "req-seller@test.local", roles: ["SELLER"] } }),
    prisma.user.create({ data: { email: "req-admin@test.local", roles: ["ADMIN"] } }),
  ]);
  sellerId = s.id;
  adminId = a.id;

  paidOrder = await newPaidOrder("25.00", "5.00");
  otherOrder = await newPaidOrder("10.00");
  const unpaid = await prisma.order.create({
    data: { quantity: 1, placedAt: new Date(), customerId: sellerId, baseCost: "9.00" },
    select: { id: true },
  });
  unpaidOrder = unpaid.id;
});

// ── Top-up ───────────────────────────────────────────────────────────────────

test("a top-up request moves NO money until it is approved — then exactly once", async () => {
  const before = await balanceOf();
  const created = await requestTopUp(seller(), {
    amount: "50.00",
    method: "bank-transfer",
    note: "wire sent this morning",
  });

  const column = await prisma.transaction.findUniqueOrThrow({
    where: { id: created.id },
    select: { status: true, type: true, amount: true, paymentMethod: true },
  });
  assert.equal(column.status, "PENDING");
  assert.equal(column.type, "TOPUP");
  assert.equal(await balanceOf(), before, "a claim is not a credit");

  // The approvers were told — that is the whole point of a request queue.
  assert.ok(
    (await prisma.notification.count({
      where: { userId: adminId, type: "TRANSACTION_REQUESTED" },
    })) > 0,
  );

  // Two admins clicking Approve at the same instant: one credit, one refusal.
  const [first, second] = await Promise.all([
    approveTransaction(admin(), created.id, ctx(admin())),
    approveTransaction(admin(), created.id, ctx(admin())),
  ]);
  const outcomes = [first.ok, second.ok].sort();
  assert.deepEqual(outcomes, [false, true], "exactly one approval wins");
  assert.equal(await balanceOf(), (Number(before) + 50).toFixed(2), "credited once, not twice");
});

// ── Refund requests ──────────────────────────────────────────────────────────

test("a refund defaults to base cost + shipping, and is capped there", async () => {
  const created = await requestRefund(seller(), {
    orderIds: [paidOrder],
    reason: "Customer returned it damaged",
  });
  assert.equal(created.amount, "30.00", "25.00 base + 5.00 shipping");

  const column = await prisma.transaction.findUniqueOrThrow({
    where: { id: created.id },
    select: { status: true, type: true, metadata: true },
  });
  assert.equal(column.status, "PENDING");
  assert.equal(column.type, "REFUND");
  assert.deepEqual((column.metadata as { orderIds: number[] }).orderIds, [paidOrder]);
});

test("asking for more than the orders are worth is refused", async () => {
  await assert.rejects(
    () =>
      requestRefund(seller(), {
        orderIds: [otherOrder],
        reason: "Please send more than it cost",
        amount: "999.00",
      }),
    (e) => e instanceof RequestError && codeOf(e) === "over-cap",
  );
});

test("a second open request for the same order is refused", async () => {
  // paidOrder already has the PENDING request from the test above.
  await assert.rejects(
    () => requestRefund(seller(), { orderIds: [paidOrder], reason: "Asking again" }),
    (e) => e instanceof RequestError && codeOf(e) === "duplicate-request",
  );
});

test("an order that was never charged cannot be refunded", async () => {
  await assert.rejects(
    () => requestRefund(seller(), { orderIds: [unpaidOrder], reason: "Never paid for this" }),
    (e) => e instanceof RequestError && codeOf(e) === "nothing-refundable",
  );
});

test("a seller cannot request a refund for someone else's order", async () => {
  const stranger = await prisma.user.create({
    data: { email: "req-stranger@test.local", roles: ["SELLER"] },
  });
  const theirs = await prisma.order.create({
    data: {
      quantity: 1,
      placedAt: new Date(),
      customerId: stranger.id,
      paid: true,
      baseCost: "40.00",
      status: "ASSIGNED",
    },
    select: { id: true },
  });

  // The scope makes the order invisible, so it reads as "nothing to refund"
  // rather than "not yours" — an id must never confirm what it points at.
  await assert.rejects(
    () => requestRefund(seller(), { orderIds: [theirs.id], reason: "Not mine but worth a try" }),
    (e) => e instanceof RequestError && codeOf(e) === "nothing-refundable",
  );
});
