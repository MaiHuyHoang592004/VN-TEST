import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma, type ClaimedOutbox } from "@fulfillflow/db";
import { encryptToken, decryptToken, ShopifyTokenManager } from "@fulfillflow/core";
import { refreshShopifyToken } from "./shopify-token-refresh.handler.js";
import { BusinessOutboxError } from "../../../queue/outbox-errors.js";

const TEST_TOKEN_ENC_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
const config = { apiKey: "key", apiSecret: "secret", tokenEncKey: TEST_TOKEN_ENC_KEY };

async function makeStore(label: string) {
  const slug = `m6-refresh-h-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: {
    organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com`, status: "ACTIVE",
    accessTokenEnc: new Uint8Array(encryptToken("shpat_old", TEST_TOKEN_ENC_KEY)),
    refreshTokenEnc: new Uint8Array(encryptToken("shprt_old", TEST_TOKEN_ENC_KEY)),
    accessTokenExpiresAt: new Date(Date.now() + 60_000),
    tokenVersion: 0,
  } });
  return { organizationId: org.id, storeId: store.id };
}
async function cleanup(ctx: { organizationId: string; storeId: string }) {
  await prisma.exceptionCase.deleteMany({ where: { organizationId: ctx.organizationId } });
  await prisma.store.delete({ where: { id: ctx.storeId } });
  await prisma.organization.delete({ where: { id: ctx.organizationId } });
}
function event(storeId: string): ClaimedOutbox {
  return { id: crypto.randomUUID(), handler: "shopify.token.refresh", payload: { storeId }, attempts: 1, aggregateType: "Store", aggregateId: storeId };
}
function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => jsonResponse(status, body)) as unknown as typeof fetch;
}

test("rotates the store's access/refresh token and bumps tokenVersion", async () => {
  const ctx = await makeStore("happy");
  const tokenManager = new ShopifyTokenManager(
    prisma, config,
    fakeFetch(200, { access_token: "shpat_new", refresh_token: "shprt_new", scope: "read_orders", expires_in: 3600 }),
  );
  try {
    await refreshShopifyToken(event(ctx.storeId), { tokenManager });
    const store = await prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
    assert.equal(store.tokenVersion, 1);
    assert.equal(decryptToken(Buffer.from(store.accessTokenEnc!), TEST_TOKEN_ENC_KEY), "shpat_new");
  } finally {
    await cleanup(ctx);
  }
});

test("a failed refresh dead-letters the outbox event (the token manager already marked the store ERROR)", async () => {
  const ctx = await makeStore("failing");
  const tokenManager = new ShopifyTokenManager(prisma, config, fakeFetch(400, { error: "invalid_grant" }));
  try {
    await assert.rejects(() => refreshShopifyToken(event(ctx.storeId), { tokenManager }), BusinessOutboxError);
    const store = await prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
    assert.equal(store.status, "ERROR");
    const exception = await prisma.exceptionCase.findFirst({ where: { subjectKey: `store:${ctx.storeId}`, code: "CHANNEL_SYNC_FAILED" } });
    assert.ok(exception);
  } finally {
    await cleanup(ctx);
  }
});
