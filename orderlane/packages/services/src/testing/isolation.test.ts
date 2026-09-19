import { after, test } from "node:test";
import assert from "node:assert/strict";

import { systemPrisma } from "@orderlane/db";

import { disconnect, seedTenant, skipWithoutDb } from "./harness.ts";

/**
 * The tenant-scoping extension is unit-tested against its argument rewriting
 * in @orderlane/db. This file tests the thing that actually matters: that a
 * real query through a real client cannot see another tenant's rows.
 */

/**
 * These tests do not reset the database between files.
 *
 * Every test seeds its own tenant, so the product's own isolation boundary is
 * what keeps them apart — which means the suite can run its files in parallel,
 * and a leak between tenants would show up as a failing test rather than as a
 * clean run. A global truncate in each file would fight that: node --test runs
 * files in separate processes, so one file's reset wipes another's fixtures
 * mid-assertion.
 */
after(async () => {
  if (skipWithoutDb.skip) return;
  await disconnect();
});

test("a scoped client cannot read another tenant's rows", skipWithoutDb, async () => {
  const a = await seedTenant();
  const b = await seedTenant();

  await a.ctx.db.product.create({ data: { tenantId: a.tenantId, slug: "mug", title: "Mug" } });
  await b.ctx.db.product.create({ data: { tenantId: b.tenantId, slug: "tote", title: "Tote" } });

  assert.deepEqual((await a.ctx.db.product.findMany()).map((p) => p.slug), ["mug"]);
  assert.deepEqual((await b.ctx.db.product.findMany()).map((p) => p.slug), ["tote"]);
  assert.equal(
    await systemPrisma.product.count({ where: { tenantId: { in: [a.tenantId, b.tenantId] } } }),
    2,
    "both rows exist; only the view is narrowed",
  );
});

test("create does not need a tenantId, and cannot be given a different one", skipWithoutDb, async () => {
  const a = await seedTenant();
  const b = await seedTenant();

  // A caller trying to write into another tenant is overwritten, not obeyed.
  await a.ctx.db.product.create({
    data: { tenantId: b.tenantId, slug: "smuggled", title: "Smuggled" },
  });

  assert.equal(await b.ctx.db.product.count(), 0, "nothing landed in the other tenant");
  assert.equal(await a.ctx.db.product.count(), 1);
});

test("findUnique by id returns nothing across a tenant boundary", skipWithoutDb, async () => {
  const a = await seedTenant();
  const b = await seedTenant();

  const theirs = await b.ctx.db.product.create({ data: { tenantId: b.tenantId, slug: "theirs", title: "Theirs" } });

  assert.equal(await a.ctx.db.product.findUnique({ where: { id: theirs.id } }), null);
  assert.notEqual(await b.ctx.db.product.findUnique({ where: { id: theirs.id } }), null);
});

test("update and delete cannot reach across a tenant boundary", skipWithoutDb, async () => {
  const a = await seedTenant();
  const b = await seedTenant();
  const theirs = await b.ctx.db.product.create({ data: { tenantId: b.tenantId, slug: "theirs", title: "Theirs" } });

  await assert.rejects(
    () => a.ctx.db.product.update({ where: { id: theirs.id }, data: { title: "Hijacked" } }),
    "an update matching zero rows raises rather than silently succeeding",
  );
  await assert.rejects(() => a.ctx.db.product.delete({ where: { id: theirs.id } }));

  const after = await b.ctx.db.product.findUnique({ where: { id: theirs.id } });
  assert.equal(after?.title, "Theirs");
});

test("the scope survives inside an interactive transaction", skipWithoutDb, async () => {
  // Worth pinning down explicitly: if extensions did not apply to the client
  // handed to a $transaction callback, every multi-step write in this codebase
  // would be unscoped, and nothing else here would notice.
  const a = await seedTenant();
  const b = await seedTenant();

  await a.ctx.db.$transaction(async (tx) => {
    await tx.product.create({ data: { tenantId: a.tenantId, slug: "in-tx", title: "In transaction" } });
  });

  assert.equal(await b.ctx.db.product.count(), 0);
  const [product] = await a.ctx.db.product.findMany();
  assert.equal(product?.slug, "in-tx");
});

test("a failed transaction leaves nothing behind", skipWithoutDb, async () => {
  const a = await seedTenant();

  await assert.rejects(
    a.ctx.db.$transaction(async (tx) => {
      await tx.product.create({ data: { tenantId: a.tenantId, slug: "doomed", title: "Doomed" } });
      throw new Error("something went wrong after the first write");
    }),
  );

  assert.equal(await a.ctx.db.product.count(), 0);
});

test("a child table cannot be read across tenants either", skipWithoutDb, async () => {
  // Found by a failing ledger test, not by review: LedgerEntry originally had
  // no tenantId and inherited its tenant through LedgerTransaction. That left
  // `db.ledgerEntry.findMany()` returning every tenant's postings — a leak
  // that looks like ordinary code. Six child tables carry the column now, and
  // this is the regression test.
  const a = await seedTenant();
  const b = await seedTenant();

  const account = await systemPrisma.ledgerAccount.create({
    data: { tenantId: b.tenantId, kind: "TENANT_WALLET", currency: "USD" },
  });
  const transaction = await systemPrisma.ledgerTransaction.create({
    data: { tenantId: b.tenantId, kind: "ADJUSTMENT", idempotencyKey: `child-${Date.now()}-${Math.random()}` },
  });
  await systemPrisma.ledgerEntry.create({
    data: { tenantId: b.tenantId, transactionId: transaction.id, accountId: account.id, direction: "CREDIT", amountMinor: 500n },
  });

  assert.equal(await a.ctx.db.ledgerEntry.count(), 0, "another tenant's postings are invisible");
  assert.equal(await b.ctx.db.ledgerEntry.count(), 1);
  assert.deepEqual(await a.ctx.db.ledgerEntry.findMany(), []);
});

test("a tenant cannot hand one of its own rows to another tenant", skipWithoutDb, async () => {
  // The unit test covers the argument rewriting; this proves it against a real
  // update. The row genuinely belongs to A, so the where-clause filter is
  // satisfied — the only thing stopping the move is the payload being stripped.
  const a = await seedTenant();
  const b = await seedTenant();

  const product = await a.ctx.db.product.create({
    data: { tenantId: a.tenantId, slug: "mine", title: "Mine" },
  });

  await a.ctx.db.product.update({
    where: { id: product.id },
    data: { title: "Renamed", tenantId: b.tenantId } as never,
  });

  assert.equal(await b.ctx.db.product.count(), 0, "the row did not move");
  const after = await a.ctx.db.product.findUniqueOrThrow({ where: { id: product.id } });
  assert.equal(after.tenantId, a.tenantId);
  assert.equal(after.title, "Renamed", "the rest of the update still applied");
});
