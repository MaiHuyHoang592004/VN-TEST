/** Pure Shopify OAuth mechanics: shop validation, authorize URL, token exchange. */

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function isValidShopDomain(shop: string): boolean {
  return SHOP_DOMAIN_RE.test(shop);
}

export function buildInstallUrl(
  shop: string,
  config: { apiKey: string; scopes: string; appUrl: string },
  state: string,
): string {
  const redirectUri = `${config.appUrl}/shopify/callback`;
  const params = new URLSearchParams({ client_id: config.apiKey, scope: config.scopes, redirect_uri: redirectUri, state });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export type TokenExchangeResult = { accessToken: string; scope: string };

export async function exchangeCodeForToken(
  shop: string,
  code: string,
  config: { apiKey: string; apiSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<TokenExchangeResult> {
  const res = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.apiKey, client_secret: config.apiSecret, code }),
  });
  if (!res.ok) {
    throw new Error(`shopify token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: unknown; scope?: unknown };
  if (typeof data.access_token !== "string") {
    throw new Error("shopify token exchange: response has no access_token");
  }
  return { accessToken: data.access_token, scope: typeof data.scope === "string" ? data.scope : "" };
}
