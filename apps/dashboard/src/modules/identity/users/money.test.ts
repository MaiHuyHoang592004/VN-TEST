/**
 * Money invariants — the checks that make the balance path trustworthy.
 * Requires a Postgres DATABASE_URL with the schema applied; run via
 * ./scripts/run-money-test.sh, which builds a scratch DB and drops it after.
 *
 * These are integration tests: they exercise the REAL service against a REAL
 * database, because the guarantees (atomic ledger, idempotency via a UNIQUE
 * constraint) are database behaviour, not logic a unit test could fake.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { prisma, Prisma, orderScope, UserRole } from "@opcreative/db";
import { topUpBalance, adjustBalance } from "./service.ts";
import { USER_ROLES } from "@opcreative/shared";

let adminId: string;
let sellerA: string;
let sellerB: string;

// The admin performing the moves, plus the audit context the transports build.
const actor = () => ({ id: adminId, roles: ["ADMIN"] as UserRole[] });
const auditCtx = () => ({ actor: actor(), ip: null, userAgent: null });

before(async () => {
  const admin = await prisma.user.create({ data: { email: "mt-admin@test.local", roles: ["ADMIN"] } });
  const a = await prisma.user.create({ data: { email: "mt-a@test.local", roles: ["SELLER"], balance: new Prisma.Decimal("100.00") } });
  const b = await prisma.user.create({ data: { email: "mt-b@test.local", roles: ["SELLER"] } });
  adminId = admin.id;
  sellerA = a.id;
  sellerB = b.id;
});

after(async () => {
  const ids = [adminId, sellerA, sellerB];
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.transaction.deleteMany({ where: { userId: { in: ids } } });
  await prisma.order.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

test("the role literals stay in sync with the Prisma enum", () => {
  assert.deepEqual([...USER_ROLES].sort(), Object.values(UserRole).sort());
});

test("a top-up moves balance and writes exactly one ledger column, together", async () => {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: sellerB }, select: { balance: true } });
  const r = await topUpBalance(actor(), sellerB, {
    amount: "25.50", reason: "manual top up", idempotencyKey: "mt-key-1",
  }, auditCtx());
  assert.equal(r.ok, true);
  const [u, txns] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: sellerB }, select: { balance: true } }),
    prisma.transaction.findMany({ where: { userId: sellerB } }),
  ]);
  assert.equal(u.balance.toFixed(2), before.balance.add(new Prisma.Decimal("25.50")).toFixed(2));
  assert.equal(txns.length, 1);
  assert.equal(txns[0].balanceAfter?.toFixed(2), u.balance.toFixed(2), "ledger balanceAfter matches the user balance");
});

test("the same idempotency key credits exactly once", async () => {
  const key = "mt-key-dup";
  const first = await topUpBalance(actor(), sellerA, { amount: "10.00", reason: "dup test", idempotencyKey: key }, auditCtx());
  const balAfterFirst = (await prisma.user.findUniqueOrThrow({ where: { id: sellerA }, select: { balance: true } })).balance;

  const second = await topUpBalance(actor(), sellerA, { amount: "10.00", reason: "dup test", idempotencyKey: key }, auditCtx());
  const balAfterSecond = (await prisma.user.findUniqueOrThrow({ where: { id: sellerA }, select: { balance: true } })).balance;

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal((second as { deduped?: boolean }).deduped, true, "second call is a no-op");
  assert.equal(balAfterFirst.toFixed(2), balAfterSecond.toFixed(2), "balance unchanged by the retry");
  const count = await prisma.transaction.count({ where: { idempotencyKey: key } });
  assert.equal(count, 1, "only one ledger column for the key");
});

test("an over-debit is rejected atomically — no partial write", async () => {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: sellerB }, select: { balance: true } });
  const txnsBefore = await prisma.transaction.count({ where: { userId: sellerB } });

  const r = await adjustBalance(actor(), sellerB, "debit", {
    amount: "999999.00", reason: "should fail", idempotencyKey: "mt-key-overdraw",
  }, auditCtx());
  assert.equal(r.ok, false);
  assert.equal((r as { error: string }).error, "insufficient-balance");

  const afterBal = await prisma.user.findUniqueOrThrow({ where: { id: sellerB }, select: { balance: true } });
  const txnsAfter = await prisma.transaction.count({ where: { userId: sellerB } });
  assert.equal(afterBal.balance.toFixed(2), before.balance.toFixed(2), "balance untouched");
  assert.equal(txnsAfter, txnsBefore, "no ledger column written");
});

test("a money move with no reason is rejected before any write", async () => {
  await assert.rejects(
    () => topUpBalance(actor(), sellerA, { amount: "5.00", reason: "", idempotencyKey: "mt-key-noreason" } as never, auditCtx()),
    "empty reason fails validation",
  );
  const count = await prisma.transaction.count({ where: { idempotencyKey: "mt-key-noreason" } });
  assert.equal(count, 0, "nothing written when validation fails");
});

test("orderScope isolates one seller's orders from another's", async () => {
  await prisma.order.create({ data: { customerId: sellerA, quantity: 1, status: "PENDING", placedAt: new Date() } });
  await prisma.order.create({ data: { customerId: sellerB, quantity: 1, status: "PENDING", placedAt: new Date() } });

  const scopeA = await orderScope({ id: sellerA, roles: ["SELLER"] });
  const visibleToA = await prisma.order.findMany({ where: scopeA, select: { customerId: true } });

  assert.ok(visibleToA.length >= 1);
  assert.ok(
    visibleToA.every((o) => o.customerId === sellerA),
    "seller A can never see seller B's rows through the scope",
  );
});
