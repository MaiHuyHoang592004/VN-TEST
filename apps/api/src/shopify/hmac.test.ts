import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookHmac } from "./hmac.js";

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
