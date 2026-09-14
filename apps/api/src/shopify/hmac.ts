/**
 * Shopify uses two different HMAC schemes and this repo must not confuse them:
 *  - Webhook delivery: base64 HMAC-SHA256 over the exact raw request body,
 *    in the `X-Shopify-Hmac-Sha256` header.
 *  - OAuth install/callback: hex HMAC-SHA256 over the sorted `key=value`
 *    query string (excluding `hmac` and `signature`), in the `hmac` param.
 * https://shopify.dev/docs/apps/build/webhooks/subscribe/https + OAuth docs.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function safeCompare(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyWebhookHmac(rawBody: Buffer, headerDigestB64: string, secret: string): boolean {
  let received: Buffer;
  try {
    received = Buffer.from(headerDigestB64, "base64");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return safeCompare(received, expected);
}

export function verifyOAuthHmac(query: Record<string, string>, secret: string): boolean {
  const { hmac } = query;
  if (!hmac) return false;
  const message = Object.keys(query)
    .filter((k) => k !== "hmac" && k !== "signature")
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  return safeCompare(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"));
}
