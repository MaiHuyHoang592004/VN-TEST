import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySessionToken } from "./session-token.js";

const apiKey = "test-api-key";
const apiSecret = "test-api-secret";
const shop = "my-shop.myshopify.com";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function makeToken(claims: Record<string, unknown>, secret = apiSecret): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function validClaims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: `https://${shop}/admin`,
    dest: `https://${shop}`,
    aud: apiKey,
    sub: "123456",
    exp: now + 60,
    nbf: now - 5,
    iat: now - 5,
    jti: "abc",
    sid: "def",
    ...overrides,
  };
}

test("accepts a well-formed, correctly-signed session token", () => {
  const token = makeToken(validClaims());
  const result = verifySessionToken(token, { apiKey, apiSecret });
  assert.equal(result.shop, shop);
  assert.equal(result.shopifyUserId, "123456");
});

test("rejects a token signed with the wrong secret", () => {
  const token = makeToken(validClaims(), "not-the-real-secret");
  assert.throws(() => verifySessionToken(token, { apiKey, apiSecret }));
});

test("rejects an expired token", () => {
  const now = Math.floor(Date.now() / 1000);
  const token = makeToken(validClaims({ exp: now - 10 }));
  assert.throws(() => verifySessionToken(token, { apiKey, apiSecret }), /expired/);
});

test("rejects a token for a different app (wrong aud)", () => {
  const token = makeToken(validClaims({ aud: "someone-elses-api-key" }));
  assert.throws(() => verifySessionToken(token, { apiKey, apiSecret }), /aud/);
});

test("rejects a token whose dest is not a myshopify.com domain", () => {
  const token = makeToken(validClaims({ dest: "https://evil.example.com" }));
  assert.throws(() => verifySessionToken(token, { apiKey, apiSecret }), /dest/);
});

test("rejects a malformed token", () => {
  assert.throws(() => verifySessionToken("not.a.jwt.at.all", { apiKey, apiSecret }));
});

test("enforces the expected shop when one is provided", () => {
  const token = makeToken(validClaims());
  assert.throws(
    () => verifySessionToken(token, { apiKey, apiSecret, expectedShop: "other-shop.myshopify.com" }),
    /shop/,
  );
});
