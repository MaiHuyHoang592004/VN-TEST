import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { processCustomersDataRequest } from "./customers-data-request.handler.js";
import { setupComplianceContext, ingestionRecord, cleanupComplianceContext } from "./compliance-test-support.js";
import { BusinessIngestionError } from "../../../ingestion/ingestion-errors.js";

test("customers/data_request records an operator-visible audit entry with no unnecessary PII", async () => {
  const ctx = await setupComplianceContext("data-request");
  try {
    const record = await ingestionRecord(ctx, "customers/data_request", {
      customer: { id: 42, email: "jane@example.com", phone: "+15551234567" },
      orders_requested: [1, 2],
    });
    await processCustomersDataRequest(record.id);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: ctx.storeId, action: "customer.data_request" } });
    assert.deepEqual(audit.after, { shopifyCustomerId: "42", ordersRequested: 2 });
    // No email/phone persisted anywhere in the audit trail for this request.
    assert.equal(JSON.stringify(audit.after).includes("jane@example.com"), false);
  } finally {
    await cleanupComplianceContext(ctx);
  }
});

test("customers/data_request rejects a malformed payload as a business (non-retryable) error", async () => {
  const ctx = await setupComplianceContext("data-request-invalid");
  try {
    const record = await ingestionRecord(ctx, "customers/data_request", {});
    await assert.rejects(() => processCustomersDataRequest(record.id), BusinessIngestionError);
  } finally {
    await cleanupComplianceContext(ctx);
  }
});
