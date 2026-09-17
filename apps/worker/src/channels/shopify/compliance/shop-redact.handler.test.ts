import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { processShopRedact } from "./shop-redact.handler.js";
import { setupComplianceContext, ingestionRecord, createOrder, cleanupComplianceContext } from "./compliance-test-support.js";

test("shop/redact purges raw ingestion payloads and anonymizes order/address PII for the store", async () => {
  const ctx = await setupComplianceContext("shop-redact");
  const order = await createOrder(ctx, "gid://shopify/Order/1");
  const delivery = await ingestionRecord(ctx, "orders/create", { id: 1, note: "has PII in here" });

  try {
    const record = await ingestionRecord(ctx, "shop/redact", { shop_id: 1, shop_domain: `${ctx.slug}.myshopify.com` });
    await processShopRedact(record.id);

    const purgedDelivery = await prisma.ingestionRecord.findUniqueOrThrow({ where: { id: delivery.id } });
    assert.equal(purgedDelivery.rawPayload, null);
    assert.ok(purgedDelivery.purgedAt);

    const anonymizedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(anonymizedOrder.customerName, null);
    assert.equal(anonymizedOrder.customerEmail, null);

    const address = await prisma.orderAddress.findUniqueOrThrow({ where: { orderId: order.id } });
    assert.equal(address.name, null);
    assert.equal(address.email, null);
    assert.equal(address.phone, null);
    assert.equal(address.line1, null);
    assert.equal(address.city, null);
    // Country is kept: non-PII aggregate shipping-destination data.
    assert.equal(address.countryCode, "US");

    const audit = await prisma.auditLog.findFirst({ where: { entityId: ctx.storeId, action: "store.shop_redact" } });
    assert.ok(audit);
    assert.deepEqual(audit?.after, { ingestionRecordsPurged: 2, ordersAnonymized: 1, addressesAnonymized: 1 });

    // Idempotent: a second run purges nothing further and doesn't throw.
    await processShopRedact(record.id);
    const secondPass = await prisma.auditLog.findMany({ where: { entityId: ctx.storeId, action: "store.shop_redact" } });
    assert.equal(secondPass.length, 2);
    assert.deepEqual(secondPass[1]?.after, { ingestionRecordsPurged: 0, ordersAnonymized: 1, addressesAnonymized: 1 });
  } finally {
    await cleanupComplianceContext(ctx);
  }
});
