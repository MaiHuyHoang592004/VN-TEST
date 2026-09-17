import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { purgeExpiredIngestionPayloads } from "./pii-retention.scheduler.js";

async function makeOrg(label: string) {
  const slug = `m6-pii-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: { organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com` } });
  return { organizationId: org.id, storeId: store.id };
}
async function cleanup(ctx: { organizationId: string; storeId: string }) {
  await prisma.ingestionRecord.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.store.delete({ where: { id: ctx.storeId } });
  await prisma.organization.delete({ where: { id: ctx.organizationId } });
}

test("purges rawPayload and stamps purgedAt only on records older than the 30-day retention window", async () => {
  const ctx = await makeOrg("basic");
  const now = new Date("2026-09-17T00:00:00Z");
  const old = await prisma.ingestionRecord.create({ data: {
    organizationId: ctx.organizationId, storeId: ctx.storeId, source: "SHOPIFY_WEBHOOK", topic: "orders/create",
    dedupeKey: crypto.randomUUID(), rawPayload: { old: true },
  } });
  await prisma.ingestionRecord.update({ where: { id: old.id }, data: { createdAt: new Date("2026-08-01T00:00:00Z") } });
  const recent = await prisma.ingestionRecord.create({ data: {
    organizationId: ctx.organizationId, storeId: ctx.storeId, source: "SHOPIFY_WEBHOOK", topic: "orders/create",
    dedupeKey: crypto.randomUUID(), rawPayload: { recent: true },
  } });

  try {
    const count = await purgeExpiredIngestionPayloads(now);
    assert.equal(count, 1);

    const purged = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: old.id } });
    assert.equal(purged.rawPayload, null);
    assert.deepEqual(purged.purgedAt, now);

    const untouched = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: recent.id } });
    assert.deepEqual(untouched.rawPayload, { recent: true });
    assert.equal(untouched.purgedAt, null);

    // Idempotent: a second sweep at the same "now" finds nothing left to purge.
    const second = await purgeExpiredIngestionPayloads(now);
    assert.equal(second, 0);
  } finally {
    await cleanup(ctx);
  }
});
