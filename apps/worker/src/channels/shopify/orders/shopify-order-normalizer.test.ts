import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeShopifyOrder } from "./shopify-order-normalizer.js";

export function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`../../../../test/fixtures/shopify/${name}.json`, import.meta.url), "utf8"));
}
test("normalizes channel identity, timestamps, money, address, lines and customization", () => {
  const order = normalizeShopifyOrder(fixture("order-paid-mapped"));
  assert.equal(order.externalId, "gid://shopify/Order/1001");
  assert.equal(order.displayNumber, "#1001");
  assert.equal(order.placedAt, "2026-09-14T08:00:00.000Z");
  assert.equal(order.channelUpdatedAt, "2026-09-14T08:01:00.000Z");
  assert.equal(order.channelFinancialStatus, "paid");
  assert.equal(order.currency, "USD");
  assert.equal(order.address.line1, "12 Test Street");
  assert.equal(order.address.countryCode, "US");
  assert.deepEqual(order.items[0], {
    externalLineId: "gid://shopify/LineItem/2001", externalVariantId: "gid://shopify/ProductVariant/3001",
    externalSku: "TEE-RED", title: "Red tee", quantity: 2, customization: { text: "Hello" },
  });
});
test("handles all plan fixtures including incomplete addresses and two lines", () => {
  assert.equal(normalizeShopifyOrder(fixture("order-unpaid")).channelFinancialStatus, "pending");
  assert.equal(normalizeShopifyOrder(fixture("order-paid-unmapped")).items[1].externalVariantId, "gid://shopify/ProductVariant/3999");
  assert.equal(normalizeShopifyOrder(fixture("order-invalid-address")).address.line1, null);
  assert.equal(normalizeShopifyOrder(fixture("order-two-lines")).items.length, 2);
});
test("rejects malformed identity, timestamps, quantities and duplicated line ids", () => {
  for (const change of [{ admin_graphql_api_id: "bad" }, { updated_at: "bad" }, { currency: "DOLLAR" }]) {
    assert.throws(() => normalizeShopifyOrder({ ...fixture("order-paid-mapped"), ...change }));
  }
  const raw = fixture("order-paid-mapped");
  assert.throws(() => normalizeShopifyOrder({ ...raw, line_items: [{ ...raw.line_items[0], quantity: 0 }] }));
  assert.throws(() => normalizeShopifyOrder({ ...raw, line_items: [raw.line_items[0], raw.line_items[0]] }));
});
