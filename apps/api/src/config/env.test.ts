import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  SHOPIFY_API_KEY: "test-key",
  SHOPIFY_API_SECRET: "test-secret",
  SHOPIFY_APP_URL: "https://app.example.com",
  SHOPIFY_TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
};

test("Shopify vars are required and loaded", () => {
  const env = loadEnv(base);
  assert.equal(env.SHOPIFY_API_KEY, "test-key");
  assert.equal(env.SHOPIFY_SCOPES, "read_orders", "has a sane default scope");
});

test("a missing SHOPIFY_API_SECRET fails loudly and names the field", () => {
  const { SHOPIFY_API_SECRET, ...rest } = base;
  assert.throws(() => loadEnv(rest), /SHOPIFY_API_SECRET/);
});

test("SHOPIFY_TOKEN_ENC_KEY must decode to exactly 32 bytes (AES-256 key)", () => {
  assert.throws(
    () => loadEnv({ ...base, SHOPIFY_TOKEN_ENC_KEY: Buffer.alloc(16).toString("base64") }),
    /SHOPIFY_TOKEN_ENC_KEY/,
  );
});
