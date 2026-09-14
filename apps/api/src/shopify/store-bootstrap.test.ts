import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { bootstrapShopifyStore } from "./store-bootstrap.js";
import { decryptToken } from "@fulfillflow/core";

const key = Buffer.alloc(32, 3).toString("base64");
const testShops: string[] = [];
const testUserIds: string[] = [];
function fresh(label: string) {
  const shop = `test-bootstrap-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.myshopify.com`;
  const shopifyUserId = `staff-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  testShops.push(shop);
  testUserIds.push(shopifyUserId);
  return { shop, shopifyUserId };
}

after(async () => {
  await prisma.organizationMembership.deleteMany({ where: { organization: { slug: { in: testShops } } } });
  await prisma.store.deleteMany({ where: { externalStoreId: { in: testShops } } });
  await prisma.organization.deleteMany({ where: { slug: { in: testShops } } });
  await prisma.user.deleteMany({ where: { shopifyUserId: { in: testUserIds } } });
  await prisma.$disconnect();
});

test("a fresh shop+user gets exactly one Organization, User, OWNER membership, and ACTIVE Store", async () => {
  const { shop, shopifyUserId } = fresh("fresh");
  const result = await bootstrapShopifyStore(prisma, {
    shop, shopifyUserId, tokenEncKey: key,
    tokens: { accessToken: "shpat_first", scope: "read_orders", refreshToken: "shrfrsh_1", accessTokenExpiresInSeconds: 86400, refreshTokenExpiresInSeconds: 31536000 },
  });

  const store = await prisma.store.findUniqueOrThrow({ where: { id: result.storeId } });
  assert.equal(store.provider, "SHOPIFY");
  assert.equal(store.status, "ACTIVE");
  assert.equal(store.tokenVersion, 1);
  assert.ok(store.installedAt);
  assert.equal(store.uninstalledAt, null);
  assert.equal(decryptToken(Buffer.from(store.accessTokenEnc!), key), "shpat_first");
  assert.equal(decryptToken(Buffer.from(store.refreshTokenEnc!), key), "shrfrsh_1");
  assert.ok(store.accessTokenExpiresAt && store.accessTokenExpiresAt.getTime() > Date.now());
  assert.ok(store.refreshTokenExpiresAt && store.refreshTokenExpiresAt.getTime() > Date.now());

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: result.organizationId } });
  assert.equal(org.slug, shop);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
  assert.equal(user.shopifyUserId, shopifyUserId);

  const membership = await prisma.organizationMembership.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: result.organizationId, userId: result.userId } },
  });
  assert.equal(membership.role, "OWNER");
});

test("bootstrapping the same shop+user twice is idempotent, not a duplicate", async () => {
  const { shop, shopifyUserId } = fresh("idempotent");
  const input = { shop, shopifyUserId, tokenEncKey: key, tokens: { accessToken: "t1", scope: "read_orders" } };

  const first = await bootstrapShopifyStore(prisma, input);
  const second = await bootstrapShopifyStore(prisma, { ...input, tokens: { accessToken: "t2", scope: "read_orders" } });

  assert.equal(second.organizationId, first.organizationId);
  assert.equal(second.storeId, first.storeId);
  assert.equal(second.userId, first.userId);
  assert.equal(await prisma.organization.count({ where: { slug: shop } }), 1);
  assert.equal(await prisma.store.count({ where: { externalStoreId: shop } }), 1);
  assert.equal(await prisma.user.count({ where: { shopifyUserId } }), 1);
  assert.equal(await prisma.organizationMembership.count({ where: { organizationId: first.organizationId, userId: first.userId } }), 1);

  const store = await prisma.store.findUniqueOrThrow({ where: { id: second.storeId } });
  assert.equal(decryptToken(Buffer.from(store.accessTokenEnc!), key), "t2", "token rotates on re-bootstrap");
  assert.equal(store.tokenVersion, 2);
});

test("a token response with no refresh token leaves refreshTokenEnc/expiry unset", async () => {
  const { shop, shopifyUserId } = fresh("classic");
  const result = await bootstrapShopifyStore(prisma, {
    shop, shopifyUserId, tokenEncKey: key,
    tokens: { accessToken: "shpat_classic", scope: "read_orders" },
  });
  const store = await prisma.store.findUniqueOrThrow({ where: { id: result.storeId } });
  assert.equal(store.refreshTokenEnc, null);
  assert.equal(store.accessTokenExpiresAt, null);
  assert.equal(store.refreshTokenExpiresAt, null);
});
