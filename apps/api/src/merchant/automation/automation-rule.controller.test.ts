import "reflect-metadata";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@fulfillflow/db";
import { AppModule } from "../../app.module.js";
import { bootstrapTenant, type BootstrappedTenant } from "../merchant-test-support.js";

let app: INestApplication;
before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
});
after(async () => { await app?.close(); await prisma.$disconnect(); });

async function cleanup(t: BootstrappedTenant) {
  await prisma.auditLog.deleteMany({ where: { organizationId: t.organizationId } });
  await prisma.automationRule.deleteMany({ where: { organizationId: t.organizationId } });
  await prisma.organizationMembership.deleteMany({ where: { organizationId: t.organizationId } });
  await prisma.store.deleteMany({ where: { id: t.storeId } });
  await prisma.organization.delete({ where: { id: t.organizationId } });
  await prisma.user.deleteMany({ where: { shopifyUserId: t.shopifyUserId } });
}

test("unauthenticated requests are rejected", async () => {
  const res = await request(app.getHttpServer()).get("/app/automation-rules");
  assert.equal(res.status, 401);
});

test("create, list, update, and delete an automation rule — all audited", async () => {
  const tenant = await bootstrapTenant(app, "crud");
  try {
    const createRes = await request(app.getHttpServer())
      .post("/app/automation-rules").set("Authorization", tenant.authHeader)
      .send({ name: "Hold US", trigger: "ORDER_RECEIVED", action: "HOLD", conditions: [{ field: "countryCode", op: "in", values: ["US"] }] });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.name, "Hold US");
    assert.equal(createRes.body.organizationId, tenant.organizationId);
    const ruleId = createRes.body.id;

    const createAudit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: ruleId, action: "automation_rule.create" } });
    assert.equal(createAudit.organizationId, tenant.organizationId);

    const listRes = await request(app.getHttpServer()).get("/app/automation-rules").set("Authorization", tenant.authHeader);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.length, 1);
    assert.equal(listRes.body[0].id, ruleId);

    const updateRes = await request(app.getHttpServer())
      .patch(`/app/automation-rules/${ruleId}`).set("Authorization", tenant.authHeader).send({ enabled: false, priority: 5 });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.enabled, false);
    assert.equal(updateRes.body.priority, 5);
    const updateAudit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: ruleId, action: "automation_rule.update" } });
    assert.equal((updateAudit.before as { enabled: boolean }).enabled, true);
    assert.equal((updateAudit.after as { enabled: boolean }).enabled, false);

    const deleteRes = await request(app.getHttpServer()).delete(`/app/automation-rules/${ruleId}`).set("Authorization", tenant.authHeader);
    assert.equal(deleteRes.status, 204);
    assert.equal(await prisma.automationRule.count({ where: { id: ruleId } }), 0);
    assert.ok(await prisma.auditLog.findFirst({ where: { entityId: ruleId, action: "automation_rule.delete" } }));
  } finally {
    await cleanup(tenant);
  }
});

test("rejects a rule with malformed conditions", async () => {
  const tenant = await bootstrapTenant(app, "invalid");
  try {
    const res = await request(app.getHttpServer())
      .post("/app/automation-rules").set("Authorization", tenant.authHeader)
      .send({ name: "Bad", trigger: "ORDER_RECEIVED", action: "HOLD", conditions: [{ field: "notReal" }] });
    assert.equal(res.status, 400);
    assert.equal(await prisma.automationRule.count({ where: { organizationId: tenant.organizationId } }), 0);
  } finally {
    await cleanup(tenant);
  }
});

test("one tenant cannot read, update, or delete another tenant's rule", async () => {
  const owner = await bootstrapTenant(app, "owner");
  const intruder = await bootstrapTenant(app, "intruder");
  try {
    const createRes = await request(app.getHttpServer())
      .post("/app/automation-rules").set("Authorization", owner.authHeader)
      .send({ name: "Owner's rule", trigger: "ORDER_RECEIVED", action: "HOLD", conditions: [] });
    const ruleId = createRes.body.id;

    const listRes = await request(app.getHttpServer()).get("/app/automation-rules").set("Authorization", intruder.authHeader);
    assert.equal(listRes.body.length, 0);

    const updateRes = await request(app.getHttpServer())
      .patch(`/app/automation-rules/${ruleId}`).set("Authorization", intruder.authHeader).send({ enabled: false });
    assert.equal(updateRes.status, 404);

    const deleteRes = await request(app.getHttpServer()).delete(`/app/automation-rules/${ruleId}`).set("Authorization", intruder.authHeader);
    assert.equal(deleteRes.status, 404);

    assert.equal(await prisma.automationRule.count({ where: { id: ruleId } }), 1);
  } finally {
    await cleanup(owner);
    await cleanup(intruder);
  }
});
