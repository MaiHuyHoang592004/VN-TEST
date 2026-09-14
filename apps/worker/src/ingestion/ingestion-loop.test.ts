import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { IngestionHandlerRegistry } from "./ingestion-handler-registry.js";
import { IngestionLoop } from "./ingestion-loop.js";

let organizationId: string;
let storeId: string;
before(async () => {
  const slug = `m3-loop-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { name: slug, slug } });
  organizationId = org.id;
  storeId = (await prisma.store.create({ data: { organizationId, provider: "MANUAL", name: slug, externalStoreId: slug } })).id;
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
