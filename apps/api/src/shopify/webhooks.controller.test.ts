import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createHmac } from "node:crypto";
import { prisma } from "@fulfillflow/db";
import { AppModule } from "../app.module.js";

const apiSecret = process.env.SHOPIFY_API_SECRET!;
const shop = `test-webhook-${Date.now()}.myshopify.com`;

let app: INestApplication;
let organizationId: string;

before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();

  const org = await prisma.organization.create({ data: { name: shop, slug: shop } });
  organizationId = org.id;
  await prisma.store.create({
    data: { organizationId, provider: "SHOPIFY", name: shop, externalStoreId: shop, status: "ACTIVE" },
  });
});
after(async () => {
  await prisma.ingestionRecord.deleteMany({ where: { organizationId } });
  await prisma.store.deleteMany({ where: { externalStoreId: shop } });
  await prisma.organization.deleteMany({ where: { slug: shop } });
  await prisma.$disconnect();
});

function post(body: string, headers: Record<string, string>) {
  return request(app.getHttpServer())
    .post("/webhooks/shopify")
    .set("Content-Type", "application/json")
    .set(headers)
    .send(body);
}
function sign(body: string) {
  return createHmac("sha256", apiSecret).update(Buffer.from(body)).digest("base64");
}

test("rejects a request with an invalid hmac and creates no record", async () => {
  const body = JSON.stringify({ id: 1, name: "#1001" });
  const res = await post(body, {
    "X-Shopify-Hmac-Sha256": "invalid==", "X-Shopify-Shop-Domain": shop,
    "X-Shopify-Webhook-Id": "wh-bad-hmac", "X-Shopify-Topic": "orders/create",
  });
  assert.equal(res.status, 401);
  assert.equal(await prisma.ingestionRecord.count({ where: { dedupeKey: "wh-bad-hmac" } }), 0);
});

test("a webhook for a shop with no installed Store is ignored with 200, not an error", async () => {
  const body = JSON.stringify({ id: 2 });
  const res = await post(body, {
    "X-Shopify-Hmac-Sha256": sign(body), "X-Shopify-Shop-Domain": "uninstalled-shop.myshopify.com",
    "X-Shopify-Webhook-Id": "wh-no-store", "X-Shopify-Topic": "orders/create",
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.ignored, true);
});

test("a valid orders/create webhook creates exactly one durable IngestionRecord with its topic recorded", async () => {
  const body = JSON.stringify({ id: 1001, name: "#1001", line_items: [{ sku: "MUG-11-WHT", quantity: 2 }] });
  const webhookId = "wh-order-1001";
  const res = await post(body, {
    "X-Shopify-Hmac-Sha256": sign(body), "X-Shopify-Shop-Domain": shop,
    "X-Shopify-Webhook-Id": webhookId, "X-Shopify-Topic": "orders/create",
  });

  assert.equal(res.status, 200);
  const record = await prisma.ingestionRecord.findUniqueOrThrow({ where: { dedupeKey: webhookId } });
  assert.equal(record.organizationId, organizationId);
  assert.equal(record.source, "SHOPIFY_WEBHOOK");
  assert.equal(record.topic, "orders/create");
  assert.equal(record.status, "PENDING");
  assert.deepEqual(record.rawPayload, JSON.parse(body));
});

test("the same canonical endpoint accepts a different topic and records it verbatim", async () => {
  const body = JSON.stringify({ id: "gid://shopify/Shop/1" });
  const webhookId = "wh-uninstall-1";
  const res = await post(body, {
    "X-Shopify-Hmac-Sha256": sign(body), "X-Shopify-Shop-Domain": shop,
    "X-Shopify-Webhook-Id": webhookId, "X-Shopify-Topic": "app/uninstalled",
  });
  assert.equal(res.status, 200);
  const record = await prisma.ingestionRecord.findUniqueOrThrow({ where: { dedupeKey: webhookId } });
  assert.equal(record.topic, "app/uninstalled");
});

test("a duplicate delivery (same X-Shopify-Webhook-Id) does not create a second record", async () => {
  const body = JSON.stringify({ id: 2002, name: "#2002" });
  const webhookId = "wh-order-2002";
  const headers = {
    "X-Shopify-Hmac-Sha256": sign(body), "X-Shopify-Shop-Domain": shop,
    "X-Shopify-Webhook-Id": webhookId, "X-Shopify-Topic": "orders/create",
  };

  const first = await post(body, headers);
  const second = await post(body, headers);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.ingestionRecordId, second.body.ingestionRecordId);
  assert.equal(await prisma.ingestionRecord.count({ where: { dedupeKey: webhookId } }), 1);
});
