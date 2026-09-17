import "reflect-metadata";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module.js";

let app: INestApplication;

test("GET /ready reports db up and echoes a correlation id", async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
  const res = await request(app.getHttpServer()).get("/ready");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, db: "up" });
  assert.ok(res.headers["x-correlation-id"]);
});

test("GET /ready preserves an incoming X-Correlation-Id instead of replacing it", async () => {
  const res = await request(app.getHttpServer()).get("/ready").set("X-Correlation-Id", "test-fixed-id");
  assert.equal(res.headers["x-correlation-id"], "test-fixed-id");
});

after(async () => { await app?.close(); });
