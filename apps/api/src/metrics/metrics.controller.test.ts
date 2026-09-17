import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@fulfillflow/db";
import { AppModule } from "../app.module.js";

const apiKey = process.env.OPERATOR_API_KEY!;
let app: INestApplication;

before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});
after(async () => { await app.close(); await prisma.$disconnect(); });

test("GET /metrics requires the operator API key", async () => {
  const res = await request(app.getHttpServer()).get("/metrics");
  assert.equal(res.status, 401);
});

test("GET /metrics returns the documented shape with the operator API key", async () => {
  const res = await request(app.getHttpServer()).get("/metrics").set("X-Operator-Api-Key", apiKey);
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.pendingIngestionCount, "number");
  assert.equal(typeof res.body.pendingOutboxCount, "number");
  assert.equal(typeof res.body.openExceptionsByCode, "object");
  assert.equal(typeof res.body.reservationFailureCount, "number");
  assert.equal(typeof res.body.shopifySyncFailures, "number");
  assert.equal(res.body.windowHours, 24);
  assert.ok(res.body.oldestPendingIngestionAgeSeconds === null || typeof res.body.oldestPendingIngestionAgeSeconds === "number");
});

test("GET /metrics honors a custom windowHours", async () => {
  const res = await request(app.getHttpServer()).get("/metrics?windowHours=1").set("X-Operator-Api-Key", apiKey);
  assert.equal(res.status, 200);
  assert.equal(res.body.windowHours, 1);
});

test("GET /metrics counts a PENDING ingestion record and reports its age", async () => {
  const slug = `m6-metrics-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: { organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com` } });
  const record = await prisma.ingestionRecord.create({ data: {
    organizationId: org.id, storeId: store.id, source: "SHOPIFY_WEBHOOK", topic: "orders/create", dedupeKey: crypto.randomUUID(),
  } });
  await prisma.ingestionRecord.update({ where: { id: record.id }, data: { createdAt: new Date(Date.now() - 5_000) } });

  try {
    const res = await request(app.getHttpServer()).get("/metrics").set("X-Operator-Api-Key", apiKey);
    assert.equal(res.status, 200);
    assert.ok(res.body.pendingIngestionCount >= 1);
    assert.ok(res.body.oldestPendingIngestionAgeSeconds >= 4);
  } finally {
    await prisma.ingestionRecord.delete({ where: { id: record.id } });
    await prisma.store.delete({ where: { id: store.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
