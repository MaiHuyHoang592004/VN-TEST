/**
 * OAuth `state` param, stateless: no server-side session store, no extra
 * table. Encodes {shop, nonce, exp} and self-signs with the app secret, so
 * the callback can verify it belongs to this app, this shop, and hasn't
 * expired — without persisting anything between install and callback.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TTL_MS = 10 * 60_000;

export function createState(shop: string, secret: string, opts: { nowMs?: number } = {}): string {
  const payload = JSON.stringify({ shop, nonce: randomBytes(8).toString("hex"), exp: (opts.nowMs ?? Date.now()) + TTL_MS });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

export function verifyState(state: string, expectedShop: string, secret: string): boolean {
  const [payloadB64, signature] = state.split(".");
  if (!payloadB64 || !signature) return false;

  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const received = Buffer.from(signature, "base64url");
  const expected = Buffer.from(expectedSig, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;

  try {
    const { shop, exp } = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return shop === expectedShop && typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
