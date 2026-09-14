import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidShopDomain, buildInstallUrl, exchangeCodeForToken } from "./oauth.service.js";

test("isValidShopDomain accepts a real-looking myshopify.com domain", () => {
  assert.equal(isValidShopDomain("my-shop-123.myshopify.com"), true);
});

test("isValidShopDomain rejects anything else", () => {
  for (const bad of ["evil.example.com", "myshopify.com", "https://my-shop.myshopify.com", "my shop.myshopify.com", ""]) {
    assert.equal(isValidShopDomain(bad), false, bad);
  }
});

test("buildInstallUrl points at the shop's authorize endpoint with our client_id/scope/redirect_uri/state", () => {
  const url = new URL(buildInstallUrl("my-shop.myshopify.com", {
    apiKey: "key123", scopes: "read_orders", appUrl: "https://app.example.com",
  }, "the-state"));
  assert.equal(url.origin, "https://my-shop.myshopify.com");
  assert.equal(url.pathname, "/admin/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "key123");
  assert.equal(url.searchParams.get("scope"), "read_orders");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.example.com/shopify/callback");
  assert.equal(url.searchParams.get("state"), "the-state");
});

function fakeFetch(status: number, body: unknown) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;
}

test("exchangeCodeForToken posts to the shop's token endpoint and returns the access token", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fetchImpl: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init?.body));
    return fakeFetch(200, { access_token: "shpat_abc", scope: "read_orders" })();
  };
  const result = await exchangeCodeForToken("my-shop.myshopify.com", "the-code", { apiKey: "key123", apiSecret: "secret456" }, fetchImpl);
  assert.equal(result.accessToken, "shpat_abc");
  assert.equal(result.scope, "read_orders");
  assert.equal(capturedUrl, "https://my-shop.myshopify.com/admin/oauth/access_token");
  assert.deepEqual(capturedBody, { client_id: "key123", client_secret: "secret456", code: "the-code" });
});

test("exchangeCodeForToken throws on a non-ok response", async () => {
  await assert.rejects(
    () => exchangeCodeForToken("my-shop.myshopify.com", "bad-code", { apiKey: "k", apiSecret: "s" }, fakeFetch(401, { error: "invalid_request" })),
  );
});

test("exchangeCodeForToken throws when the response has no access_token", async () => {
  await assert.rejects(
    () => exchangeCodeForToken("my-shop.myshopify.com", "code", { apiKey: "k", apiSecret: "s" }, fakeFetch(200, { scope: "read_orders" })),
  );
});
