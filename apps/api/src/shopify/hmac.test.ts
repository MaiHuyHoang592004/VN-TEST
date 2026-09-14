import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookHmac, verifyOAuthHmac } from "./hmac.js";

const secret = "test-app-secret";

test("verifyWebhookHmac accepts a correctly-signed raw body", () => {
  const body = Buffer.from(JSON.stringify({ id: 123, name: "#1001" }));
  const digest = createHmac("sha256", secret).update(body).digest("base64");
  assert.equal(verifyWebhookHmac(body, digest, secret), true);
});

test("verifyWebhookHmac rejects a wrong signature", () => {
  const body = Buffer.from(JSON.stringify({ id: 123 }));
  assert.equal(verifyWebhookHmac(body, "not-the-real-digest==", secret), false);
});

test("verifyWebhookHmac rejects a signature computed with a different secret", () => {
  const body = Buffer.from(JSON.stringify({ id: 123 }));
  const digest = createHmac("sha256", "wrong-secret").update(body).digest("base64");
  assert.equal(verifyWebhookHmac(body, digest, secret), false);
});

test("verifyWebhookHmac rejects a tampered body even with a stale valid-looking header", () => {
  const original = Buffer.from(JSON.stringify({ id: 123 }));
  const digest = createHmac("sha256", secret).update(original).digest("base64");
  const tampered = Buffer.from(JSON.stringify({ id: 456 }));
  assert.equal(verifyWebhookHmac(tampered, digest, secret), false);
});

function signQuery(query: Record<string, string>, appSecret: string): string {
  const message = Object.keys(query)
    .filter((k) => k !== "hmac" && k !== "signature")
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join("&");
  return createHmac("sha256", appSecret).update(message).digest("hex");
}

test("verifyOAuthHmac accepts a correctly-signed query string (install/callback)", () => {
  const query: Record<string, string> = { shop: "my-shop.myshopify.com", timestamp: "1717000000", state: "abc123" };
  query.hmac = signQuery(query, secret);
  assert.equal(verifyOAuthHmac(query, secret), true);
});

test("verifyOAuthHmac rejects when a query param was tampered with after signing", () => {
  const query: Record<string, string> = { shop: "my-shop.myshopify.com", timestamp: "1717000000" };
  query.hmac = signQuery(query, secret);
  query.shop = "attacker-shop.myshopify.com";
  assert.equal(verifyOAuthHmac(query, secret), false);
});

test("verifyOAuthHmac rejects when hmac param is missing", () => {
  assert.equal(verifyOAuthHmac({ shop: "my-shop.myshopify.com" }, secret), false);
});
