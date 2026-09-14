/**
 * Walks the entire M2 acceptance gate as one scenario, not just its parts in
 * isolation:
 *
 *   install → Store ACTIVE → valid session → orders/create webhook (HMAC) →
 *   exactly one IngestionRecord → worker claims it
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
import { createState } from "./oauth-state.js";

const apiKey = process.env.SHOPIFY_API_KEY!;
const apiSecret = process.env.SHOPIFY_API_SECRET!;
const shop = `m2-acceptance-${Date.now()}.myshopify.com`;

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
  await prisma.store.deleteMany({ where: { externalStoreId: shop } });
  await prisma.organization.deleteMany({ where: { slug: shop } });
  await app?.close();
});

function signQuery(query: Record<string, string>) {
  const message = Object.keys(query).filter((k) => k !== "hmac").sort().map((k) => `${k}=${query[k]}`).join("&");
  return createHmac("sha256", apiSecret).update(message).digest("hex");
}
function b64url(input: Buffer | string) { return Buffer.from(input).toString("base64url"); }
function sessionToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: `https://${shop}/admin`, dest: `https://${shop}`, aud: apiKey, sub: "staff-1",
    exp: now + 60, nbf: now - 5, iat: now - 5, jti: "j", sid: "s",
  }));
  const sig = createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

test("M2 acceptance gate: install → session → webhook → worker claim", async () => {
  // 1. Install: Shopify redirects the merchant to /shopify/install, which
  //    redirects onward to Shopify's consent screen.
  const installRes = await request(app.getHttpServer()).get("/shopify/install").query({ shop });
  assert.equal(installRes.status, 302);

  // 2. Callback: Shopify calls back with a signed query + our state; we
  //    exchange the code (mocked here — no real Shopify in tests) and
  //    bootstrap the Store.
  globalThis.fetch = (async () => ({
    ok: true, status: 200,
    json: async () => ({ access_token: "shpat_m2-acceptance", scope: "read_orders" }),
    text: async () => "",
  })) as unknown as typeof fetch;
  const callbackQuery: Record<string, string> = { shop, code: "the-code", state: createState(shop, apiSecret) };
  callbackQuery.hmac = signQuery(callbackQuery);
  const callbackRes = await request(app.getHttpServer()).get("/shopify/callback").query(callbackQuery);
  assert.equal(callbackRes.status, 302);

  const store = await prisma.store.findUniqueOrThrow({
    where: { provider_externalStoreId: { provider: "SHOPIFY", externalStoreId: shop } },
  });
  assert.equal(store.status, "ACTIVE", "Store ACTIVE exists");

  // 3. Valid auth/session: the embedded app opens and calls an authenticated endpoint.
  const sessionRes = await request(app.getHttpServer())
    .get("/shopify/session")
    .set("Authorization", `Bearer ${sessionToken()}`);
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.body.store.id, store.id, "valid auth/session");

  // 4. A real order is placed → Shopify delivers orders/create.
  const orderPayload = JSON.stringify({ id: 555001, name: "#M2-1", line_items: [{ sku: "MUG-11-WHT", quantity: 1 }] });
  const webhookId = `m2-acceptance-webhook-${Date.now()}`;
  const bodyHmac = createHmac("sha256", apiSecret).update(Buffer.from(orderPayload)).digest("base64");
  const webhookRes = await request(app.getHttpServer())
    .post("/webhooks/shopify/orders-create")
    .set("Content-Type", "application/json")
    .set("X-Shopify-Hmac-Sha256", bodyHmac)
    .set("X-Shopify-Shop-Domain", shop)
    .set("X-Shopify-Webhook-Id", webhookId)
    .send(orderPayload);
  assert.equal(webhookRes.status, 201, "orders/create delivered, HMAC valid");

  const records = await prisma.ingestionRecord.findMany({ where: { dedupeKey: webhookId } });
  assert.equal(records.length, 1, "exactly one IngestionRecord");
  assert.equal(records[0].status, "PENDING");

  // 5. The worker claims it (same primitive @fulfillflow/worker's loop uses).
  const claimed = await claimIngestion(prisma, { limit: 10, leaseSeconds: 60 });
  assert.ok(claimed.some((r) => r.id === records[0].id), "worker claims record");
});
