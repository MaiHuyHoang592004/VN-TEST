import "reflect-metadata";
import { test, before, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createHmac } from "node:crypto";
import { prisma } from "@fulfillflow/db";
import { AppModule } from "../app.module.js";

const apiKey = process.env.SHOPIFY_API_KEY!;
const apiSecret = process.env.SHOPIFY_API_SECRET!;

let app: INestApplication;
const testShops: string[] = [];
const testUserIds: string[] = [];

before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
});
after(async () => {
  await prisma.organizationMembership.deleteMany({ where: { organization: { slug: { in: testShops } } } });
  await prisma.store.deleteMany({ where: { externalStoreId: { in: testShops } } });
  await prisma.organization.deleteMany({ where: { slug: { in: testShops } } });
  await prisma.user.deleteMany({ where: { shopifyUserId: { in: testUserIds } } });
  await app?.close();
});

let originalFetch: typeof fetch;
beforeEach(() => { originalFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = originalFetch; });

function b64url(input: Buffer | string) { return Buffer.from(input).toString("base64url"); }
function idToken(shop: string, sub: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: `https://${shop}/admin`, dest: `https://${shop}`, aud: apiKey, sub,
    exp: now + 60, nbf: now - 5, iat: now - 5, jti: "j", sid: "s",
  }));
  const sig = createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function freshShopAndUser(label: string) {
  const shop = `test-session-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.myshopify.com`;
  const shopifyUserId = `staff-${label}-${Date.now()}`;
  testShops.push(shop);
  testUserIds.push(shopifyUserId);
  return { shop, shopifyUserId };
}

function mockTokenExchange(accessToken: string) {
  globalThis.fetch = (async () => ({
    ok: true, status: 200,
    json: async () => ({ access_token: accessToken, scope: "read_orders" }),
    text: async () => "",
  })) as unknown as typeof fetch;
}

test("POST /app/session/bootstrap with no token is rejected", async () => {
  const res = await request(app.getHttpServer()).post("/app/session/bootstrap");
  assert.equal(res.status, 401);
});

test("GET /app/session with no token is rejected", async () => {
  const res = await request(app.getHttpServer()).get("/app/session");
  assert.equal(res.status, 401);
});

test("GET /app/session with a valid token but no bootstrapped Store is rejected, not silently 404", async () => {
  const { shop, shopifyUserId } = freshShopAndUser("no-store");
  const res = await request(app.getHttpServer()).get("/app/session").set("Authorization", `Bearer ${idToken(shop, shopifyUserId)}`);
  assert.equal(res.status, 401);
});

test("bootstrap creates the tenant from a verified ID token via token exchange, and GET /app/session then succeeds", async () => {
  const { shop, shopifyUserId } = freshShopAndUser("full-flow");
  mockTokenExchange("shpat_bootstrap-flow");

  const bootstrapRes = await request(app.getHttpServer())
    .post("/app/session/bootstrap")
    .set("Authorization", `Bearer ${idToken(shop, shopifyUserId)}`);
  assert.equal(bootstrapRes.status, 200);
  assert.equal(bootstrapRes.body.tenant.shopDomain, shop);

  const sessionRes = await request(app.getHttpServer())
    .get("/app/session")
    .set("Authorization", `Bearer ${idToken(shop, shopifyUserId)}`);
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.body.tenant.storeId, bootstrapRes.body.tenant.storeId);
  assert.equal(sessionRes.body.tenant.organizationId, bootstrapRes.body.tenant.organizationId);
});

test("bootstrapping twice is idempotent — no duplicate Organization/User/Store", async () => {
  const { shop, shopifyUserId } = freshShopAndUser("idempotent");
  mockTokenExchange("shpat_first");
  const first = await request(app.getHttpServer()).post("/app/session/bootstrap").set("Authorization", `Bearer ${idToken(shop, shopifyUserId)}`);

  mockTokenExchange("shpat_second");
  const second = await request(app.getHttpServer()).post("/app/session/bootstrap").set("Authorization", `Bearer ${idToken(shop, shopifyUserId)}`);

  assert.equal(first.body.tenant.storeId, second.body.tenant.storeId);
  assert.equal(await prisma.organization.count({ where: { slug: shop } }), 1);
  assert.equal(await prisma.store.count({ where: { externalStoreId: shop } }), 1);
  assert.equal(await prisma.user.count({ where: { shopifyUserId } }), 1);
});
