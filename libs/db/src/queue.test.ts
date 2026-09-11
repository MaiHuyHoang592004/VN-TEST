import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./client.ts";
import { claimOutbox, completeOutbox, failOutbox } from "./queue.ts";
import { seedV2 } from "../prisma/scripts/seed-v2.ts";

let organizationId: string;

before(async () => {
  ({ organizationId } = await seedV2(prisma));
  await prisma.outboxEvent.deleteMany({ where: { handler: "test.echo" } });
});
after(async () => { await prisma.$disconnect(); });

async function insert(n: number) {
  await prisma.outboxEvent.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      organizationId, eventKey: `test.echo:${Date.now()}:${i}`, aggregateType: "Test", aggregateId: String(i),
      handler: "test.echo", payload: { i },
    })),
  });
}

test("two concurrent claimers never claim the same row", async () => {
  await insert(10);
  const [a, b] = await Promise.all([
    claimOutbox(prisma, { limit: 10, leaseSeconds: 60 }),
    claimOutbox(prisma, { limit: 10, leaseSeconds: 60 }),
  ]);
  const ids = [...a, ...b].map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicates across claimers");
  assert.equal(ids.length, 10);
  for (const r of [...a, ...b]) await completeOutbox(prisma, r.id);
  assert.equal(await prisma.outboxEvent.count({ where: { handler: "test.echo", status: "PENDING" } }), 0);
});

test("an expired lease makes the row claimable again", async () => {
  await insert(1);
  const [row] = await claimOutbox(prisma, { limit: 1, leaseSeconds: 1 });
  assert.ok(row);
  assert.equal((await claimOutbox(prisma, { limit: 1, leaseSeconds: 1 })).length, 0, "still leased");
  await new Promise((r) => setTimeout(r, 1200));
  const again = await claimOutbox(prisma, { limit: 1, leaseSeconds: 60 });
  assert.equal(again[0]?.id, row.id);
  await completeOutbox(prisma, row.id);
});

test("failOutbox backs off then dead-letters", async () => {
  await insert(1);
  const [row] = await claimOutbox(prisma, { limit: 1, leaseSeconds: 60 });
  assert.equal(await failOutbox(prisma, row.id, { error: "boom", maxAttempts: 2 }), "retry");
  const after1 = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(after1.status, "PENDING");
  assert.ok(after1.availableAt.getTime() > Date.now() + 20_000, "backoff pushed availableAt into the future");
  await prisma.outboxEvent.update({ where: { id: row.id }, data: { availableAt: new Date(0) } });
  const [row2] = await claimOutbox(prisma, { limit: 1, leaseSeconds: 60 });
  assert.equal(row2.id, row.id);
  assert.equal(await failOutbox(prisma, row.id, { error: "boom", maxAttempts: 2 }), "dead");
  const after2 = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(after2.status, "DEAD_LETTER");
  assert.equal(after2.lastError, "boom");
});
