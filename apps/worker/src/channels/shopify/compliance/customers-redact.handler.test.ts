import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { processCustomersRedact } from "./customers-redact.handler.js";
import { setupComplianceContext, ingestionRecord, createOrder, cleanupComplianceContext } from "./compliance-test-support.js";
import { BusinessIngestionError } from "../../../ingestion/ingestion-errors.js";

test("customers/redact anonymizes only the orders named in orders_to_redact", async () => {
  const ctx = await setupComplianceContext("customers-redact");
  const targeted = await createOrder(ctx, "gid://shopify/Order/1");
  const untouched = await createOrder(ctx, "gid://shopify/Order/2");

  try {
    const record = await ingestionRecord(ctx, "customers/redact", {
      customer: { id: 555, email: "jane@example.com" },
      orders_to_redact: [1],
    });
    await processCustomersRedact(record.id);

    const targetedOrder = await prisma.order.findUniqueOrThrow({ where: { id: targeted.id } });
    assert.equal(targetedOrder.customerEmail, null);
    const targetedAddress = await prisma.orderAddress.findUniqueOrThrow({ where: { orderId: targeted.id } });
    assert.equal(targetedAddress.email, null);

    const untouchedOrder = await prisma.order.findUniqueOrThrow({ where: { id: untouched.id } });
    assert.equal(untouchedOrder.customerEmail, "jane@example.com");
    const untouchedAddress = await prisma.orderAddress.findUniqueOrThrow({ where: { orderId: untouched.id } });
    assert.equal(untouchedAddress.email, "jane@example.com");

    const audit = await prisma.auditLog.findFirst({ where: { entityId: ctx.storeId, action: "customer.redact" } });
    assert.deepEqual(audit?.after, { shopifyCustomerId: "555", ordersRequested: 1, ordersAnonymized: 1, addressesAnonymized: 1 });
  } finally {
    await cleanupComplianceContext(ctx);
  }
});

test("customers/redact with an empty orders_to_redact list is a legitimate no-op", async () => {
  const ctx = await setupComplianceContext("customers-redact-empty");
  const order = await createOrder(ctx, "gid://shopify/Order/1");
  try {
    const record = await ingestionRecord(ctx, "customers/redact", { customer: { id: 555 }, orders_to_redact: [] });
    await processCustomersRedact(record.id);
    const unchanged = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(unchanged.customerEmail, "jane@example.com");
  } finally {
    await cleanupComplianceContext(ctx);
  }
});

test("customers/redact rejects a malformed payload as a business (non-retryable) error", async () => {
  const ctx = await setupComplianceContext("customers-redact-invalid");
  try {
    const record = await ingestionRecord(ctx, "customers/redact", { not_a_customer: true });
    await assert.rejects(() => processCustomersRedact(record.id), BusinessIngestionError);
  } finally {
    await cleanupComplianceContext(ctx);
  }
});
