/**
 * Verifies a Shopify session token (the JWT App Bridge attaches as
 * `Authorization: Bearer <token>` on every embedded-app request). Hand-rolled
 * HS256 verification via node:crypto — no jsonwebtoken dependency needed for
 * one fixed algorithm.
 * https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionTokenClaims = {
  iss: string; dest: string; aud: string; sub: string;
  exp: number; nbf: number; iat: number; jti: string; sid: string;
};

export type VerifiedSession = { shop: string; shopifyUserId: string };

export type VerifyOptions = { apiKey: string; apiSecret: string; expectedShop?: string };

function b64urlDecode(segment: string): Buffer {
  return Buffer.from(segment, "base64url");
}

export function verifySessionToken(token: string, opts: VerifyOptions): VerifiedSession {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("session token: malformed (expected 3 JWT segments)");
  const [headerB64, payloadB64, signatureB64] = parts;

  const expected = createHmac("sha256", opts.apiSecret).update(`${headerB64}.${payloadB64}`).digest();
  const received = b64urlDecode(signatureB64);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error("session token: signature mismatch");
  }

  let claims: SessionTokenClaims;
  try {
    claims = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    throw new Error("session token: payload is not valid JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("session token: expired");
  if (typeof claims.nbf === "number" && claims.nbf > now) throw new Error("session token: not yet valid (nbf)");
  if (claims.aud !== opts.apiKey) throw new Error("session token: aud does not match this app's API key");

  let shop: string;
  try {
    shop = new URL(claims.dest).hostname;
  } catch {
    throw new Error("session token: dest is not a URL");
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
    throw new Error("session token: dest is not a myshopify.com domain");
  }
  if (opts.expectedShop && shop !== opts.expectedShop) {
    throw new Error("session token: shop does not match the expected store");
  }
  if (!claims.sub) throw new Error("session token: missing sub (Shopify user id)");

  return { shop, shopifyUserId: claims.sub };
}
