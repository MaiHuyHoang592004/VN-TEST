import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createHmac } from "node:crypto";
import { prisma } from "@fulfillflow/db";
import { AppModule } from "../app.module.js";

const apiKey = process.env.SHOPIFY_API_KEY!;
const apiSecret = process.env.SHOPIFY_API_SECRET!;
const shop = `test-session-${Date.now()}.myshopify.com`;

let app: INestApplication;

function b64url(input: Buffer | string) { return Buffer.from(input).toString("base64url"); }
function sessionToken(claims: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const sig = createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}
function validToken(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return sessionToken({
    iss: `https://${shop}/admin`, dest: `https://${shop}`, aud: apiKey, sub: "999",
    exp: now + 60, nbf: now - 5, iat: now - 5, jti: "j", sid: "s", ...overrides,
  });
}

before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
});
after(async () => {
  await prisma.store.deleteMany({ where: { externalStoreId: shop } });
  await prisma.organization.deleteMany({ where: { slug: shop } });
  await app?.close();
});

test("GET /shopify/session with no Authorization header is rejected", async () => {
  const res = await request(app.getHttpServer()).get("/shopify/session");
  assert.equal(res.status, 401);
});

test("GET /shopify/session with a garbage token is rejected", async () => {
  const res = await request(app.getHttpServer()).get("/shopify/session").set("Authorization", "Bearer not-a-real-token");
  assert.equal(res.status, 401);
});

test("GET /shopify/session with a valid token but no installed Store is a 404", async () => {
  const res = await request(app.getHttpServer()).get("/shopify/session").set("Authorization", `Bearer ${validToken()}`);
  assert.equal(res.status, 404);
});

test("GET /shopify/session with a valid token and an installed Store returns it", async () => {
  const org = await prisma.organization.create({ data: { name: shop, slug: shop } });
  await prisma.store.create({
    data: { organizationId: org.id, provider: "SHOPIFY", name: shop, externalStoreId: shop, status: "ACTIVE" },
  });

  const res = await request(app.getHttpServer()).get("/shopify/session").set("Authorization", `Bearer ${validToken()}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.shop, shop);
  assert.equal(res.body.store.status, "ACTIVE");
  assert.equal(res.body.store.organizationId, org.id);
});
