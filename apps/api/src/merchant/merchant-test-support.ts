import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createHmac } from "node:crypto";

const apiKey = process.env.SHOPIFY_API_KEY!;
const apiSecret = process.env.SHOPIFY_API_SECRET!;

function b64url(input: Buffer | string) { return Buffer.from(input).toString("base64url"); }

function idToken(shop: string, sub: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: `https://${shop}/admin`, dest: `https://${shop}`, aud: apiKey, sub,
    exp: now + 60, nbf: now - 5, iat: now - 5, jti: "j", sid: "s",
  }));
  const sig = createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

/** Bootstraps a fresh tenant exactly like session.controller.test.ts does, and returns a ready-to-use Authorization header for every subsequent `/app/**` request. */
export async function bootstrapTenant(app: INestApplication, label: string) {
  const shop = `test-merchant-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.myshopify.com`;
  const shopifyUserId = `staff-${label}-${Date.now()}`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true, status: 200, json: async () => ({ access_token: `shpat_${label}`, scope: "read_orders" }), text: async () => "",
  })) as unknown as typeof fetch;

  const token = idToken(shop, shopifyUserId);
  const res = await request(app.getHttpServer()).post("/app/session/bootstrap").set("Authorization", `Bearer ${token}`);
  globalThis.fetch = originalFetch;
  if (res.status !== 200) throw new Error(`bootstrap failed: ${res.status} ${JSON.stringify(res.body)}`);

  return {
    shop, shopifyUserId,
    authHeader: `Bearer ${token}`,
    organizationId: res.body.tenant.organizationId as string,
    storeId: res.body.tenant.storeId as string,
  };
}
export type BootstrappedTenant = Awaited<ReturnType<typeof bootstrapTenant>>;
