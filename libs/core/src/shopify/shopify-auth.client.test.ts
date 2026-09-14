import { test } from "node:test";
import assert from "node:assert/strict";
import { exchangeIdToken, refreshAccessToken } from "./shopify-auth.client.ts";

const config = { apiKey: "key123", apiSecret: "secret456" };

function fakeFetch(status: number, body: unknown, capture?: { url?: string; body?: unknown }) {
  return (async (url: string | URL, init?: RequestInit) => {
    if (capture) {
      capture.url = String(url);
      capture.body = JSON.parse(String(init?.body));
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;
}

test("exchangeIdToken posts the token-exchange grant with the ID token as subject_token", async () => {
  const capture: { url?: string; body?: unknown } = {};
  const result = await exchangeIdToken(
    "my-shop.myshopify.com", "the-id-token", config,
    fakeFetch(200, { access_token: "shpat_offline", scope: "read_orders", expires_in: 86400, refresh_token: "shrfrsh_1", refresh_token_expires_in: 31536000 }, capture),
  );
  assert.equal(capture.url, "https://my-shop.myshopify.com/admin/oauth/access_token");
  assert.deepEqual(capture.body, {
    client_id: "key123",
    client_secret: "secret456",
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: "the-id-token",
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
  });
  assert.equal(result.accessToken, "shpat_offline");
  assert.equal(result.refreshToken, "shrfrsh_1");
  assert.equal(result.accessTokenExpiresInSeconds, 86400);
  assert.equal(result.refreshTokenExpiresInSeconds, 31536000);
});

test("exchangeIdToken tolerates a non-expiring token response (no refresh_token/expires_in)", async () => {
  const result = await exchangeIdToken("my-shop.myshopify.com", "tok", config, fakeFetch(200, { access_token: "shpat_classic", scope: "read_orders" }));
  assert.equal(result.accessToken, "shpat_classic");
  assert.equal(result.refreshToken, undefined);
  assert.equal(result.accessTokenExpiresInSeconds, undefined);
});

test("refreshAccessToken posts the refresh_token grant", async () => {
  const capture: { url?: string; body?: unknown } = {};
  const result = await refreshAccessToken(
    "my-shop.myshopify.com", "shrfrsh_old", config,
    fakeFetch(200, { access_token: "shpat_new", scope: "read_orders", expires_in: 86400, refresh_token: "shrfrsh_new", refresh_token_expires_in: 31536000 }, capture),
  );
  assert.deepEqual(capture.body, {
    client_id: "key123", client_secret: "secret456", grant_type: "refresh_token", refresh_token: "shrfrsh_old",
  });
  assert.equal(result.accessToken, "shpat_new");
  assert.equal(result.refreshToken, "shrfrsh_new", "never reuse the old refresh token after rotation");
});

test("a non-ok response throws instead of returning a partial token", async () => {
  await assert.rejects(() => exchangeIdToken("my-shop.myshopify.com", "bad", config, fakeFetch(401, { error: "invalid_subject_token" })));
  await assert.rejects(() => refreshAccessToken("my-shop.myshopify.com", "expired", config, fakeFetch(400, { error: "invalid_grant" })));
});

test("a response with no access_token throws", async () => {
  await assert.rejects(() => exchangeIdToken("my-shop.myshopify.com", "tok", config, fakeFetch(200, { scope: "read_orders" })));
});
