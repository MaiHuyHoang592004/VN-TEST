/**
 * Walks the corrected M2 acceptance gate as one scenario, not just its parts
 * in isolation:
 *
 *   embedded app opens (verified ID token) → token exchange → bootstrap
 *   (Store ACTIVE) → valid session → orders/create webhook via the canonical
 *   endpoint (HMAC) → exactly one IngestionRecord → worker claims it
 *
 * No OAuth redirect anywhere in this flow — managed installation only.
 */
import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createHmac } from "node:crypto";
import { prisma, claimIngestion } from "@fulfillflow/db";
import { AppModule } from "../app.module.js";

const apiKey = process.env.SHOPIFY_API_KEY!;
const apiSecret = process.env.SHOPIFY_API_SECRET!;
const shop = `m2-acceptance-${Date.now()}.myshopify.com`;
const shopifyUserId = `staff-m2-acceptance-${Date.now()}`;

let app: INestApplication;
let originalFetch: typeof fetch;

before(async () => {
  originalFetch = globalThis.fetch;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
});
after(async () => {
  globalThis.fetch = originalFetch;
  await prisma.ingestionRecord.deleteMany({ where: { store: { externalStoreId: shop } } });
  await prisma.organizationMembership.deleteMany({ where: { organization: { slug: shop } } });
  await prisma.store.deleteMany({ where: { externalStoreId: shop } });
  await prisma.organization.deleteMany({ where: { slug: shop } });
  await prisma.user.deleteMany({ where: { shopifyUserId } });
  await app?.close();
});

function b64url(input: Buffer | string) { return Buffer.from(input).toString("base64url"); }
function idToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: `https://${shop}/admin`, dest: `https://${shop}`, aud: apiKey, sub: shopifyUserId,
    exp: now + 60, nbf: now - 5, iat: now - 5, jti: "j", sid: "s",
  }));
  const sig = createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

test("M2 acceptance gate: managed-install bootstrap → session → webhook → worker claim", async () => {
  // 1. Embedded app opens for the first time. It hands us its ID token; we
  //    exchange it for an offline access token (mocked here — no real
  //    Shopify in tests) and bootstrap the tenant. No redirect involved.
  globalThis.fetch = (async () => ({
    ok: true, status: 200,
    json: async () => ({ access_token: "shpat_m2-acceptance", scope: "read_orders", expires_in: 86400, refresh_token: "shrfrsh_m2" }),
    text: async () => "",
  })) as unknown as typeof fetch;

  const bootstrapRes = await request(app.getHttpServer())
    .post("/app/session/bootstrap")
    .set("Authorization", `Bearer ${idToken()}`);
  assert.equal(bootstrapRes.status, 200, "managed installation bootstrap succeeds");
  const { storeId } = bootstrapRes.body.tenant;

  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  assert.equal(store.status, "ACTIVE", "Store ACTIVE exists");

  // 2. Valid auth/session: the embedded app calls an authenticated endpoint on a later load.
  const sessionRes = await request(app.getHttpServer())
    .get("/app/session")
    .set("Authorization", `Bearer ${idToken()}`);
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.body.tenant.storeId, storeId, "valid auth/session");

  // 3. A real order is placed → Shopify delivers via the one canonical webhook endpoint.
  const orderPayload = JSON.stringify({ id: 555001, name: "#M2-1", line_items: [{ sku: "MUG-11-WHT", quantity: 1 }] });
  const webhookId = `m2-acceptance-webhook-${Date.now()}`;
  const bodyHmac = createHmac("sha256", apiSecret).update(Buffer.from(orderPayload)).digest("base64");
  const webhookRes = await request(app.getHttpServer())
    .post("/webhooks/shopify")
    .set("Content-Type", "application/json")
    .set("X-Shopify-Hmac-Sha256", bodyHmac)
    .set("X-Shopify-Shop-Domain", shop)
    .set("X-Shopify-Webhook-Id", webhookId)
    .set("X-Shopify-Topic", "orders/create")
    .send(orderPayload);
  assert.equal(webhookRes.status, 200, "orders/create delivered via the canonical endpoint, HMAC valid");

  const records = await prisma.ingestionRecord.findMany({ where: { dedupeKey: webhookId } });
  assert.equal(records.length, 1, "exactly one IngestionRecord");
  assert.equal(records[0].status, "PENDING");
  assert.equal(records[0].topic, "orders/create");

  // 4. The worker claims it (same primitive @fulfillflow/worker's loop uses).
  const claimed = await claimIngestion(prisma, { limit: 10, leaseSeconds: 60 });
  assert.ok(claimed.some((r) => r.id === records[0].id), "worker claims record");
});
