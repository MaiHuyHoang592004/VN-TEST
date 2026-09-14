import "reflect-metadata";
import { test, before, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createHmac } from "node:crypto";
import { prisma } from "@fulfillflow/db";
import { AppModule } from "../app.module.js";
import { createState } from "./oauth-state.js";

const apiSecret = process.env.SHOPIFY_API_SECRET!;
const apiKey = process.env.SHOPIFY_API_KEY!;

let app: INestApplication;
const testShops: string[] = [];

before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
});
after(async () => {
  await prisma.store.deleteMany({ where: { externalStoreId: { in: testShops } } });
  await prisma.organization.deleteMany({ where: { slug: { in: testShops } } });
  await app?.close();
});

let originalFetch: typeof fetch;
beforeEach(() => { originalFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = originalFetch; });

function signQuery(query: Record<string, string>, secret: string): string {
  const message = Object.keys(query).filter((k) => k !== "hmac").sort().map((k) => `${k}=${query[k]}`).join("&");
  return createHmac("sha256", secret).update(message).digest("hex");
}

test("GET /shopify/install rejects a malformed shop domain", async () => {
  const res = await request(app.getHttpServer()).get("/shopify/install").query({ shop: "not-a-shop" });
  assert.equal(res.status, 400);
});

test("GET /shopify/install redirects to the shop's authorize screen with a signed state", async () => {
  const shop = "install-test.myshopify.com";
  const res = await request(app.getHttpServer()).get("/shopify/install").query({ shop });
  assert.equal(res.status, 302);
  const location = new URL(res.headers.location);
  assert.equal(location.origin, `https://${shop}`);
  assert.equal(location.pathname, "/admin/oauth/authorize");
  assert.equal(location.searchParams.get("client_id"), apiKey);
  assert.ok(location.searchParams.get("state"));
});

test("GET /shopify/callback rejects an invalid hmac", async () => {
  const shop = "callback-badhmac.myshopify.com";
  const res = await request(app.getHttpServer())
    .get("/shopify/callback")
    .query({ shop, code: "x", state: createState(shop, apiSecret), hmac: "0000000000000000000000000000000000000000000000000000000000000000" });
  assert.equal(res.status, 401);
});

test("GET /shopify/callback rejects a state for a different shop", async () => {
  const shop = "callback-wrongstate.myshopify.com";
  const query: Record<string, string> = { shop, code: "x", state: createState("someone-else.myshopify.com", apiSecret) };
  query.hmac = signQuery(query, apiSecret);
  const res = await request(app.getHttpServer()).get("/shopify/callback").query(query);
  assert.equal(res.status, 401);
});

test("GET /shopify/callback with a valid hmac+state+code bootstraps the Store and redirects into the embedded app", async () => {
  const shop = "callback-success.myshopify.com";
  testShops.push(shop);
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ access_token: "shpat_e2e-token", scope: "read_orders" }),
    text: async () => "",
  })) as unknown as typeof fetch;

  const query: Record<string, string> = { shop, code: "the-code", state: createState(shop, apiSecret) };
  query.hmac = signQuery(query, apiSecret);
  const res = await request(app.getHttpServer()).get("/shopify/callback").query(query);

  assert.equal(res.status, 302);
  assert.equal(res.headers.location, `https://${shop}/admin/apps/${apiKey}`);

  const store = await prisma.store.findUniqueOrThrow({ where: { provider_externalStoreId: { provider: "SHOPIFY", externalStoreId: shop } } });
  assert.equal(store.status, "ACTIVE");
});
