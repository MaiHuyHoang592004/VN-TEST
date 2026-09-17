import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { encryptToken } from "@fulfillflow/core";
import { enqueueExpiringTokenRefreshes } from "./shopify-token-refresh.scheduler.js";

const TEST_TOKEN_ENC_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";

async function makeStore(label: string, overrides: Partial<{ status: "ACTIVE" | "DISCONNECTED" | "ERROR"; accessTokenExpiresAt: Date | null; hasRefreshToken: boolean; tokenVersion: number }> = {}) {
  const slug = `m6-refresh-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: {
    organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com`,
    status: overrides.status ?? "ACTIVE",
    accessTokenEnc: new Uint8Array(encryptToken("shpat_fake", TEST_TOKEN_ENC_KEY)),
    refreshTokenEnc: overrides.hasRefreshToken === false ? null : new Uint8Array(encryptToken("shprt_fake", TEST_TOKEN_ENC_KEY)),
    accessTokenExpiresAt: overrides.accessTokenExpiresAt === undefined ? new Date(Date.now() + 5 * 60_000) : overrides.accessTokenExpiresAt,
    tokenVersion: overrides.tokenVersion ?? 0,
  } });
  return { organizationId: org.id, storeId: store.id };
}
async function cleanup(ctx: { organizationId: string; storeId: string }) {
  await prisma.outboxEvent.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.store.delete({ where: { id: ctx.storeId } });
  await prisma.organization.delete({ where: { id: ctx.organizationId } });
}

test("enqueues shopify.token.refresh for an ACTIVE store expiring within the window, and only once per tokenVersion", async () => {
  const ctx = await makeStore("expiring");
  try {
    const first = await enqueueExpiringTokenRefreshes(prisma);
    assert.equal(first, 1);
    const events = await prisma.outboxEvent.findMany({ where: { organizationId: ctx.organizationId } });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.handler, "shopify.token.refresh");
    assert.equal(events[0]?.aggregateType, "Store");
    assert.equal(events[0]?.aggregateId, ctx.storeId);
    assert.deepEqual(events[0]?.payload, { storeId: ctx.storeId });

    // Same tick again: no duplicate for the same tokenVersion.
    const second = await enqueueExpiringTokenRefreshes(prisma);
    assert.equal(second, 0);
    const stillOne = await prisma.outboxEvent.count({ where: { organizationId: ctx.organizationId } });
    assert.equal(stillOne, 1);
  } finally {
    await cleanup(ctx);
  }
});

test("skips a store whose token is not expiring soon", async () => {
  const ctx = await makeStore("fresh", { accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000) });
  try {
    const count = await enqueueExpiringTokenRefreshes(prisma);
    assert.equal(count, 0);
  } finally {
    await cleanup(ctx);
  }
});

test("skips a non-ACTIVE store even if its token is expiring", async () => {
  const ctx = await makeStore("disconnected", { status: "DISCONNECTED" });
  try {
    const count = await enqueueExpiringTokenRefreshes(prisma);
    assert.equal(count, 0);
  } finally {
    await cleanup(ctx);
  }
});

test("skips a store with no refresh token (non-expiring token)", async () => {
  const ctx = await makeStore("no-refresh", { hasRefreshToken: false });
  try {
    const count = await enqueueExpiringTokenRefreshes(prisma);
    assert.equal(count, 0);
  } finally {
    await cleanup(ctx);
  }
});

test("a new tokenVersion after rotation gets a fresh eventKey and can be queued again", async () => {
  const ctx = await makeStore("rotated");
  try {
    await enqueueExpiringTokenRefreshes(prisma);
    await prisma.store.update({ where: { id: ctx.storeId }, data: { tokenVersion: { increment: 1 }, accessTokenExpiresAt: new Date(Date.now() + 5 * 60_000) } });
    const count = await enqueueExpiringTokenRefreshes(prisma);
    assert.equal(count, 1);
    const events = await prisma.outboxEvent.count({ where: { organizationId: ctx.organizationId } });
    assert.equal(events, 2);
  } finally {
    await cleanup(ctx);
  }
});
