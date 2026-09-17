import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { IngestionClaimLoop } from "./ingestion-claim-loop.js";

const slug = `test-ingestion-loop-${Date.now()}`;
let organizationId: string;
let storeId: string;

before(async () => {
  const org = await prisma.organization.create({ data: { name: slug, slug } });
  const store = await prisma.store.create({
    data: { organizationId: org.id, provider: "MANUAL", name: "test store", externalStoreId: `manual:${slug}` },
  });
  organizationId = org.id;
  storeId = store.id;
});
after(async () => {
  await prisma.ingestionRecord.deleteMany({ where: { organizationId } });
  await prisma.store.deleteMany({ where: { id: storeId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

async function insertRecord(suffix: string) {
  return prisma.ingestionRecord.create({
    data: {
      organizationId, storeId, source: "API", topic: "orders/create",
      dedupeKey: `test.ingestion-loop:${Date.now()}:${suffix}:${Math.random()}`,
    },
  });
}

test("tick claims a pending IngestionRecord and leases it", async () => {
  const record = await insertRecord("a");
  const loop = new IngestionClaimLoop(prisma, { batchSize: 10, leaseSeconds: 60 });

  const claimed = await loop.tick();

  const ids = claimed.map((r) => r.id);
  assert.ok(ids.includes(record.id));
  const row = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } });
  assert.ok(row.lockedUntil && row.lockedUntil.getTime() > Date.now());
  assert.equal(row.attempts, 1);
});

test("two concurrent claimers never claim the same record", async () => {
  await Promise.all(["b", "c", "d"].map(insertRecord));
  const loop = new IngestionClaimLoop(prisma, { batchSize: 10, leaseSeconds: 60 });

  const [a, b] = await Promise.all([loop.tick(), loop.tick()]);
  const ids = [...a, ...b].map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicates across claimers");
});

test("a claimed record is not re-claimed until its lease expires", async () => {
  const record = await insertRecord("e");
  const loop = new IngestionClaimLoop(prisma, { batchSize: 10, leaseSeconds: 60 });

  const first = await loop.tick();
  assert.ok(first.some((r) => r.id === record.id));

  const second = await loop.tick();
  assert.ok(!second.some((r) => r.id === record.id), "still leased, not claimable again");
});

test("an expired lease makes the record claimable again (crash recovery)", async () => {
  const record = await insertRecord("f");
  const loop = new IngestionClaimLoop(prisma, { batchSize: 10, leaseSeconds: 1 });

  const first = await loop.tick();
  assert.ok(first.some((r) => r.id === record.id));
  const second = await loop.tick();
  assert.ok(!second.some((r) => r.id === record.id), "still leased");

  // 1s lease + generous margin — matches libs/db/src/queue.test.ts's own
  // margin, chosen there after observing a tighter one flake on CI runners.
  await new Promise((r) => setTimeout(r, 2500));
  const third = await loop.tick();
  assert.ok(third.some((r) => r.id === record.id), "expired lease reclaimed by a fresh tick — a crashed worker's claim is never permanently stuck");
});

test("run() stops on abort", async () => {
  const loop = new IngestionClaimLoop(prisma, { batchSize: 1, leaseSeconds: 30, pollMs: 10 });
  const ac = new AbortController();
  const done = loop.run(ac.signal);
  setTimeout(() => ac.abort(), 50);
  await done; // resolves instead of hanging
  assert.ok(true);
});
