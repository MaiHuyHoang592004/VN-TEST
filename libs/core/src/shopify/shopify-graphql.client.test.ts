import { test } from "node:test";
import assert from "node:assert/strict";
import { shopifyGraphql, ShopifyRetryableError } from "./shopify-graphql.client.ts";

function fakeFetch(status: number, jsonBody: unknown, headers: Record<string, string> = {}) {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  })) as unknown as typeof fetch;
}

test("returns data on a clean 200 response", async () => {
  const data = await shopifyGraphql("shop.myshopify.com", "tok", "query{}", {}, fakeFetch(200, { data: { ok: true } }));
  assert.deepEqual(data, { ok: true });
});

test("sends the access token header and POST body", async () => {
  let captured: { url?: string; init?: RequestInit } = {};
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    captured = { url, init };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: {} }), text: async () => "" };
  }) as unknown as typeof fetch;
  await shopifyGraphql("shop.myshopify.com", "tok123", "query{ x }", { a: 1 }, fetchImpl);
  assert.equal(captured.url, "https://shop.myshopify.com/admin/api/2026-07/graphql.json");
  assert.equal((captured.init?.headers as Record<string, string>)["X-Shopify-Access-Token"], "tok123");
  assert.deepEqual(JSON.parse(String(captured.init?.body)), { query: "query{ x }", variables: { a: 1 } });
});

test("429 with Retry-After header surfaces that as retryAfterSeconds", async () => {
  await assert.rejects(
    shopifyGraphql("shop.myshopify.com", "tok", "query{}", {}, fakeFetch(429, {}, { "Retry-After": "7" })),
    (err: unknown) => {
      assert.ok(err instanceof ShopifyRetryableError);
      assert.equal(err.retryAfterSeconds, 7);
      return true;
    },
  );
});

test("5xx without Retry-After is retryable with no fixed delay", async () => {
  await assert.rejects(
    shopifyGraphql("shop.myshopify.com", "tok", "query{}", {}, fakeFetch(503, {})),
    (err: unknown) => { assert.ok(err instanceof ShopifyRetryableError); assert.equal(err.retryAfterSeconds, undefined); return true; },
  );
});

test("a network failure is retryable", async () => {
  const fetchImpl = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
  await assert.rejects(
    shopifyGraphql("shop.myshopify.com", "tok", "query{}", {}, fetchImpl),
    (err: unknown) => { assert.ok(err instanceof ShopifyRetryableError); return true; },
  );
});

test("a THROTTLED GraphQL error computes retryAfterSeconds from throttleStatus", async () => {
  const body = {
    errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
    extensions: { cost: { requestedQueryCost: 100, throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 50, restoreRate: 50 } } },
  };
  await assert.rejects(
    shopifyGraphql("shop.myshopify.com", "tok", "query{}", {}, fakeFetch(200, body)),
    (err: unknown) => { assert.ok(err instanceof ShopifyRetryableError); assert.equal(err.retryAfterSeconds, 1); return true; },
  );
});

test("a THROTTLED error with no cost data falls back to a 1-second minimum backoff", async () => {
  const body = { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] };
  await assert.rejects(
    shopifyGraphql("shop.myshopify.com", "tok", "query{}", {}, fakeFetch(200, body)),
    (err: unknown) => { assert.ok(err instanceof ShopifyRetryableError); assert.equal(err.retryAfterSeconds, 1); return true; },
  );
});

test("a non-throttled GraphQL error is not retryable", async () => {
  const body = { errors: [{ message: "Field 'x' doesn't exist" }] };
  await assert.rejects(
    shopifyGraphql("shop.myshopify.com", "tok", "query{}", {}, fakeFetch(200, body)),
    (err: unknown) => { assert.ok(!(err instanceof ShopifyRetryableError)); assert.ok(String((err as Error).message).includes("doesn't exist")); return true; },
  );
});
