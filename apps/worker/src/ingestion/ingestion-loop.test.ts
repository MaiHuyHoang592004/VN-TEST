import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { IngestionHandlerRegistry } from "./ingestion-handler-registry.js";
import { IngestionLoop } from "./ingestion-loop.js";
import { RetryableIngestionError, BusinessIngestionError } from "./ingestion-errors.js";

let organizationId: string;
let storeId: string;
before(async () => {
  const slug = `m3-loop-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { name: slug, slug } });
  organizationId = org.id;
  storeId = (await prisma.store.create({ data: { organizationId, provider: "MANUAL", name: slug, externalStoreId: slug } })).id;
});

test("retryable errors clear the lease and back off, then terminate at the attempt limit", async () => {
  const record = await insert();
  const registry = new IngestionHandlerRegistry().register("orders/create", async () => { throw new RetryableIngestionError("temporary"); });
  const loop = new IngestionLoop(prisma, registry, { ...opts, maxAttempts: 2 });
  await loop.tick();
  const row = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } });
  assert.equal(row.status, "PENDING");
  assert.equal(row.lockedUntil, null);
  assert.ok(row.nextAttemptAt.getTime() > Date.now() + 30_000);
  await prisma.ingestionRecord.update({ where: { id: record.id }, data: { nextAttemptAt: new Date(0) } });
  await loop.tick();
  const failed = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } });
  assert.equal(failed.status, "EXCEPTION");
  assert.equal(failed.errorCode, "RETRY_EXHAUSTED");
  assert.equal(failed.errorMessage, "temporary");
  assert.equal(failed.attempts, 2);
});

test("business errors settle EXCEPTION with their code and message, without retrying", async () => {
  const record = await insert();
  const registry = new IngestionHandlerRegistry().register("orders/create", async () => { throw new BusinessIngestionError("SKU_NOT_MAPPED", "unknown variant"); });
  await new IngestionLoop(prisma, registry, opts).tick();
  const row = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } });
  assert.equal(row.status, "EXCEPTION");
  assert.equal(row.errorCode, "SKU_NOT_MAPPED");
  assert.equal(row.errorMessage, "unknown variant");
  assert.equal(row.lockedUntil, null);
  assert.ok(row.processedAt);
});
after(async () => {
  try {
    if (organizationId) {
      await prisma.ingestionRecord.deleteMany({ where: { organizationId } });
      await prisma.store.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
  } finally { await prisma.$disconnect(); }
});
const opts = { batchSize: 20, leaseSeconds: 60, maxAttempts: 3, pollMs: 10 };

test("run aborts promptly during idle polling and drains an in-flight handler", async () => {
  const ac = new AbortController();
  const record = await insert();
  const registry = new IngestionHandlerRegistry().register("orders/create", async () => { ac.abort(); });
  const loop = new IngestionLoop(prisma, registry, { ...opts, pollMs: 60_000 });
  await loop.run(ac.signal);
  assert.equal((await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } })).status, "ACCEPTED");
  const idle = new AbortController();
  const run = loop.run(idle.signal);
  setTimeout(() => idle.abort(), 30);
  await run;
});
async function insert(topic = "orders/create") {
  return prisma.ingestionRecord.create({ data: {
    organizationId, storeId, source: "SHOPIFY_WEBHOOK", topic, dedupeKey: crypto.randomUUID(),
  } });
}
test("dispatches by persisted topic and accepts only after the handler succeeds", async () => {
  const record = await insert();
  const seen: string[] = [];
  const registry = new IngestionHandlerRegistry().register("orders/create", async (claimed) => {
    assert.equal((await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: claimed.id } })).status, "PENDING");
    assert.equal(claimed.organizationId, organizationId);
    assert.equal(claimed.storeId, storeId);
    seen.push(claimed.id);
  });
  assert.equal(await new IngestionLoop(prisma, registry, opts).tick(), 1);
  assert.deepEqual(seen, [record.id]);
  const row = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: record.id } });
  assert.equal(row.status, "ACCEPTED");
  assert.equal(row.lockedUntil, null);
  assert.ok(row.processedAt);
});
