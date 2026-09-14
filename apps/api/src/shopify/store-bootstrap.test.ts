import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { bootstrapShopifyStore } from "./store-bootstrap.js";
import { decryptToken } from "./token-crypto.js";

const key = Buffer.alloc(32, 3).toString("base64");
const testShops: string[] = [];
function freshShop(label: string): string {
  const shop = `test-bootstrap-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.myshopify.com`;
  testShops.push(shop);
  return shop;
}

after(async () => {
  await prisma.store.deleteMany({ where: { externalStoreId: { in: testShops } } });
  await prisma.organization.deleteMany({ where: { slug: { in: testShops } } });
  await prisma.$disconnect();
});

test("a fresh shop gets an Organization and an ACTIVE Store with the token encrypted", async () => {
  const shop = freshShop("fresh");
  const result = await bootstrapShopifyStore(prisma, {
    shop, accessToken: "shpat_first-token", scope: "read_orders", tokenEncKey: key,
  });

  const store = await prisma.store.findUniqueOrThrow({ where: { id: result.storeId } });
  assert.equal(store.provider, "SHOPIFY");
  assert.equal(store.externalStoreId, shop);
  assert.equal(store.status, "ACTIVE");
  assert.equal(store.tokenVersion, 1);
  assert.ok(store.installedAt);
  assert.equal(store.uninstalledAt, null);
  assert.ok(store.accessTokenEnc);
  assert.equal(decryptToken(Buffer.from(store.accessTokenEnc!), key), "shpat_first-token");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: result.organizationId } });
  assert.equal(org.slug, shop);
});

test("re-running for the same shop reuses the Organization/Store and rotates the token", async () => {
  const shop = freshShop("reinstall");
  const first = await bootstrapShopifyStore(prisma, {
    shop, accessToken: "shpat_first-token", scope: "read_orders", tokenEncKey: key,
  });
  const firstStore = await prisma.store.findUniqueOrThrow({ where: { id: first.storeId } });

  const second = await bootstrapShopifyStore(prisma, {
    shop, accessToken: "shpat_second-token", scope: "read_orders,write_orders", tokenEncKey: key,
  });

  assert.equal(second.storeId, first.storeId, "same store row, not a duplicate");
  assert.equal(second.organizationId, first.organizationId);
  assert.equal(await prisma.store.count({ where: { externalStoreId: shop } }), 1);

  const store = await prisma.store.findUniqueOrThrow({ where: { id: second.storeId } });
  assert.equal(decryptToken(Buffer.from(store.accessTokenEnc!), key), "shpat_second-token");
  assert.equal(store.grantedScopes, "read_orders,write_orders");
  assert.equal(store.tokenVersion, 2, "token rotation bumps the version");
  assert.equal(store.installedAt?.getTime(), firstStore.installedAt?.getTime(), "installedAt is the original install");
});
