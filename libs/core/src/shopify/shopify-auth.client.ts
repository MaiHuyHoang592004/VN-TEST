/**
 * Talks to Shopify's token endpoint for the two grants the token manager
 * needs: token-exchange (turn a verified embedded-app ID token into an
 * offline access token, for managed installation — no OAuth redirect) and
 * refresh (rotate an expiring offline token before/after it lapses).
 * https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange
 */

export type TokenResponse = {
  accessToken: string;
  scope: string;
  refreshToken?: string;
  accessTokenExpiresInSeconds?: number;
  refreshTokenExpiresInSeconds?: number;
};

export type ShopifyAuthConfig = { apiKey: string; apiSecret: string };

async function postTokenEndpoint(
  shop: string,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TokenResponse> {
  const res = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`shopify token endpoint failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token?: unknown; scope?: unknown; refresh_token?: unknown;
    expires_in?: unknown; refresh_token_expires_in?: unknown;
  };
  if (typeof data.access_token !== "string") {
    throw new Error("shopify token endpoint: response has no access_token");
  }
  return {
    accessToken: data.access_token,
    scope: typeof data.scope === "string" ? data.scope : "",
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    accessTokenExpiresInSeconds: typeof data.expires_in === "number" ? data.expires_in : undefined,
    refreshTokenExpiresInSeconds: typeof data.refresh_token_expires_in === "number" ? data.refresh_token_expires_in : undefined,
  };
}

/** Managed installation: exchange the embedded app's verified ID token for an offline access token. No authorization-code redirect involved. */
export async function exchangeIdToken(
  shop: string,
  idToken: string,
  config: ShopifyAuthConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  return postTokenEndpoint(shop, {
    client_id: config.apiKey,
    client_secret: config.apiSecret,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: idToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
  }, fetchImpl);
}

/** Rotates an expiring offline token using its refresh token. */
export async function refreshAccessToken(
  shop: string,
  refreshToken: string,
  config: ShopifyAuthConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  return postTokenEndpoint(shop, {
    client_id: config.apiKey,
    client_secret: config.apiSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }, fetchImpl);
}
