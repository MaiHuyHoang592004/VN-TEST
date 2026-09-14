/**
 * Verifies a Shopify webhook delivery: base64 HMAC-SHA256 over the exact raw
 * request body, compared against the `X-Shopify-Hmac-Sha256` header.
 * https://shopify.dev/docs/apps/build/webhooks/subscribe/https
 *
 * There is no OAuth query-string HMAC to verify — managed installation has no
 * redirect callback, so that second Shopify HMAC scheme doesn't apply here.
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
