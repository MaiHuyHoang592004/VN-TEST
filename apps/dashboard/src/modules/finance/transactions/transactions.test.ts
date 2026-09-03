/**
 * Approve/reject invariants. The rows this settles are real money someone is
 * owed, and the failure modes are the expensive kind: crediting twice, or
 * crediting and losing the record that says why.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, Prisma, type UserRole } from "@opcreative/db";
import { approveTransaction, rejectTransaction, listTransactions } from "./service.ts";

let adminId: string;
let sellerA: string;
let sellerB: string;

const admin = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const asSellerA = () => ({ id: sellerA, roles: ["SELLER"] as UserRole[] });
const ctx = () => ({ actor: admin(), ip: null, userAgent: null });

/** A pending column of the kind the cutover brings across, or a seller claims. */
async function pending(userId: string, amount: string, type: "TOPUP" | "REFUND" | "ADJUSTMENT" = "TOPUP") {
  return prisma.transaction.create({
    data: { userId, amount: new Prisma.Decimal(amount), type, status: "PENDING", note: "claimed a bank transfer" },
    select: { id: true },
  });
}

const balanceOf = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { balance: true } })).balance;

before(async () => {
  const [a, s1, s2] = await Promise.all([
    prisma.user.create({ data: { email: "tx-admin@test.local", roles: ["ADMIN"] } }),
    prisma.user.create({ data: { email: "tx-a@test.local", roles: ["SELLER"], balance: new Prisma.Decimal("50.00") } }),
    prisma.user.create({ data: { email: "tx-b@test.local", roles: ["SELLER"] } }),
  ]);
  adminId = a.id;
  sellerA = s1.id;
  sellerB = s2.id;
});

after(async () => {
  const ids = [adminId, sellerA, sellerB];
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.transaction.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

test("approving a pending top-up credits the balance exactly once", async () => {
  const column = await pending(sellerA, "25.50");
  const before = await balanceOf(sellerA);

  const first = await approveTransaction(admin(), column.id, ctx());
  assert.equal(first.ok, true);
  const mid = await balanceOf(sellerA);
  assert.equal(mid.sub(before).toFixed(2), "25.50");

  // The double-click. There is no idempotency key here on purpose: the guard
  // is a compare-and-set on status, so a second approve finds nothing pending.
  const second = await approveTransaction(admin(), column.id, ctx());
  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.error, "not-pending");
  assert.equal((await balanceOf(sellerA)).toFixed(2), mid.toFixed(2), "not credited twice");
});

test("two admins approving AT ONCE still credit exactly once", async () => {
  // The test above passes even with the database guard removed, because the
  // service's status pre-check catches a SEQUENTIAL second approve. This is
  // the case that pre-check cannot help with: both calls read PENDING before
  // either writes. Only the compare-and-set in settlePendingTransaction
  // decides it, so this is the assertion that actually holds that line.
  const column = await pending(sellerA, "40.00");
  const before = await balanceOf(sellerA);

  const [a, b] = await Promise.all([
    approveTransaction(admin(), column.id, ctx()),
    approveTransaction(admin(), column.id, ctx()),
  ]);

  const winners = [a, b].filter((r) => r.ok).length;
  assert.equal(winners, 1, "exactly one approval won");
  assert.equal(
    (await balanceOf(sellerA)).sub(before).toFixed(2),
    "40.00",
    "credited once, not twice",
  );
});

test("the settled column explains the balance it produced", async () => {
  const before = await balanceOf(sellerB);
  const column = await pending(sellerB, "10.00");
  await approveTransaction(admin(), column.id, ctx());

  const saved = await prisma.transaction.findUniqueOrThrow({ where: { id: column.id } });
  assert.equal(saved.status, "COMPLETED");
  assert.equal(saved.balanceBefore?.toFixed(2), before.toFixed(2));
  assert.equal(saved.balanceAfter?.toFixed(2), (await balanceOf(sellerB)).toFixed(2));

  // A settlement nobody can trace is the legacy failure; the audit column is the
  // difference between a ledger and a rumour.
  const audit = await prisma.auditLog.findFirst({
    where: { action: "TRANSACTION_APPROVED", targetId: String(column.id) },
  });
  assert.ok(audit, "an audit column exists for the approval");

  // The seller asked for this and was waiting: a balance that changes in
  // silence is indistinguishable from one that did not change.
  const told = await prisma.notification.findFirst({
    where: { userId: sellerB, type: "TRANSACTION_APPROVED" },
  });
  assert.ok(told, "the seller is told it was approved");
});

test("rejecting never moves a balance, and records the reason", async () => {
  const column = await pending(sellerA, "999.00");
  const before = await balanceOf(sellerA);

  const r = await rejectTransaction(admin(), column.id, { reason: "no matching bank deposit found" }, ctx());
  assert.equal(r.ok, true);
  assert.equal((await balanceOf(sellerA)).toFixed(2), before.toFixed(2), "balance untouched");

  const saved = await prisma.transaction.findUniqueOrThrow({ where: { id: column.id } });
  assert.equal(saved.status, "CANCELLED");
  assert.equal(saved.note, "no matching bank deposit found", "the seller can see why");

  // The refusal AND its reason must reach them, or this becomes a support
  // ticket every time.
  const told = await prisma.notification.findFirst({
    where: { userId: sellerA, type: "TRANSACTION_REJECTED" },
    orderBy: { id: "desc" },
  });
  assert.ok(told, "the seller is told it was rejected");
  assert.equal(
    (told.data as { reason?: string } | null)?.reason,
    "no matching bank deposit found",
    "and the reason travels with it",
  );
});

test("a rejection without a reason is refused before anything is written", async () => {
  const column = await pending(sellerA, "5.00");
  await assert.rejects(() => rejectTransaction(admin(), column.id, { reason: "" }, ctx()));
  const saved = await prisma.transaction.findUniqueOrThrow({ where: { id: column.id } });
  assert.equal(saved.status, "PENDING", "still pending — nothing was written");
});

test("an already-approved column cannot be approved or rejected again", async () => {
  const column = await pending(sellerA, "1.00");
  assert.equal((await approveTransaction(admin(), column.id, ctx())).ok, true);

  const reapprove = await approveTransaction(admin(), column.id, ctx());
  assert.equal(reapprove.ok === false && reapprove.error, "not-pending");
  const reject = await rejectTransaction(admin(), column.id, { reason: "changed my mind" }, ctx());
  assert.equal(reject.ok === false && reject.error, "not-pending");
});

test("only money owed TO a seller is approvable", async () => {
  // An ORDER_PAYMENT is charged atomically at assignment and an ADJUSTMENT is
  // the admin's own act. Approving either here would credit a second time.
  const adj = await pending(sellerA, "5.00", "ADJUSTMENT");
  const r = await approveTransaction(admin(), adj.id, ctx());
  assert.equal(r.ok === false && r.error, "not-approvable");
});

test("a seller still sees only their own rows (same scope as /profile/billing)", async () => {
  // The regression check doc 04 asks for: adding the admin ledger must not
  // widen what a seller can read, because both call this one function.
  const { rows } = await listTransactions(asSellerA(), {});
  assert.ok(rows.length > 0, "seller A has rows of their own");
  assert.ok(rows.every((r) => r.user.id === sellerA), "and not one of seller B's");

  const asAdmin = await listTransactions(admin(), {});
  assert.ok(
    asAdmin.rows.some((r) => r.user.id === sellerB),
    "while an admin sees across accounts",
  );
});
