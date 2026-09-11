import "reflect-metadata";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module.js";

let app: INestApplication;

test("GET /health reports db up", async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
  const res = await request(app.getHttpServer()).get("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, db: "up" });
});

after(async () => { await app?.close(); });
