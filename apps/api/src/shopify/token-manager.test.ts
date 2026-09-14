import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@fulfillflow/db";
import { ShopifyTokenManager, ShopifyUnauthorizedError } from "./token-manager.js";
import { encryptToken, decryptToken } from "./token-crypto.js";

const key = Buffer.alloc(32, 5).toString("base64");
const config = { apiKey: "key", apiSecret: "secret", tokenEncKey: key };
const testShops: string[] = [];

after(async () => {
  await prisma.exceptionCase.deleteMany({ where: { organization: { slug: { in: testShops } } } });
  await prisma.store.deleteMany({ where: { externalStoreId: { in: testShops } } });
  await prisma.organization.deleteMany({ where: { slug: { in: testShops } } });
  await prisma.$disconnect();
});

async function makeStore(label: string, opts: {
  accessToken?: string; refreshToken?: string | null; expiresInMs?: number | null;
} = {}) {
  const shop = `test-tokenmgr-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.myshopify.com`;
  testShops.push(shop);
  const org = await prisma.organization.create({ data: { name: shop, slug: shop } });
  const store = await prisma.store.create({
    data: {
      organizationId: org.id, provider: "SHOPIFY", name: shop, externalStoreId: shop, status: "ACTIVE",
      accessTokenEnc: new Uint8Array(encryptToken(opts.accessToken ?? "shpat_current", key)),
      refreshTokenEnc: opts.refreshToken === null ? null : new Uint8Array(encryptToken(opts.refreshToken ?? "shrfrsh_current", key)),
      accessTokenExpiresAt: opts.expiresInMs === null ? null : new Date(Date.now() + (opts.expiresInMs ?? 3600_000)),
      tokenVersion: 1,
    },
  });
  return { org, store };
}

function fakeRefreshFetch(sequence: Array<{ status: number; body: unknown }>) {
  let i = 0;
  return (async () => {
    const step = sequence[Math.min(i, sequence.length - 1)];
    i++;
    return { ok: step.status >= 200 && step.status < 300, status: step.status, json: async () => step.body, text: async () => JSON.stringify(step.body) };
  }) as unknown as typeof fetch;
}

test("withAccessToken calls fn with the decrypted token when nothing needs refreshing", async () => {
  const { store } = await makeStore("fresh", { accessToken: "shpat_valid" });
  const manager = new ShopifyTokenManager(prisma, config, fakeRefreshFetch([{ status: 500, body: {} }]));
  const seen = await manager.withAccessToken(store.id, async (token) => token);
  assert.equal(seen, "shpat_valid", "no refresh call was needed, so the fake 500 was never hit");
});

test("refreshes before calling fn when the access token expires within 5 minutes", async () => {
  const { store } = await makeStore("expiring", { accessToken: "shpat_stale", expiresInMs: 60_000 });
  const manager = new ShopifyTokenManager(prisma, config, fakeRefreshFetch([
    { status: 200, body: { access_token: "shpat_fresh", scope: "read_orders", expires_in: 3600, refresh_token: "shrfrsh_new" } },
  ]));
  const seen = await manager.withAccessToken(store.id, async (token) => token);
  assert.equal(seen, "shpat_fresh");
  const row = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
  assert.equal(row.tokenVersion, 2);
});

test("one 401 from fn triggers exactly one refresh and one retry, which succeeds", async () => {
  const { store } = await makeStore("retry-success", { accessToken: "shpat_about_to_401" });
  const manager = new ShopifyTokenManager(prisma, config, fakeRefreshFetch([
    { status: 200, body: { access_token: "shpat_after_retry", scope: "read_orders", refresh_token: "shrfrsh_new" } },
  ]));
  let calls = 0;
  const result = await manager.withAccessToken(store.id, async (token) => {
    calls++;
    if (calls === 1) throw new ShopifyUnauthorizedError("401 from Shopify");
    return token;
  });
  assert.equal(calls, 2);
  assert.equal(result, "shpat_after_retry");
});

test("a second 401 after the retry surfaces the error", async () => {
  const { store } = await makeStore("retry-fails", { accessToken: "shpat_x" });
  const manager = new ShopifyTokenManager(prisma, config, fakeRefreshFetch([
    { status: 200, body: { access_token: "shpat_y", scope: "read_orders", refresh_token: "shrfrsh_y" } },
  ]));
  await assert.rejects(
    () => manager.withAccessToken(store.id, async () => { throw new ShopifyUnauthorizedError("still 401"); }),
    ShopifyUnauthorizedError,
  );
});

test("a non-401 error from fn is never retried", async () => {
  const { store } = await makeStore("non-401");
  const manager = new ShopifyTokenManager(prisma, config, fakeRefreshFetch([{ status: 500, body: {} }]));
  await assert.rejects(() => manager.withAccessToken(store.id, async () => { throw new Error("boom, not a 401"); }), /boom/);
});

test("two concurrent refreshers: exactly one optimistic tokenVersion update wins, both end up with a valid current token", async () => {
  const { store } = await makeStore("concurrent", { expiresInMs: 60_000 });
  let call = 0;
  const fetchImpl = (async () => {
    call++;
    return { ok: true, status: 200, json: async () => ({ access_token: `shpat_winner_${call}`, scope: "read_orders", refresh_token: `shrfrsh_${call}` }), text: async () => "" };
  }) as unknown as typeof fetch;
  const manager = new ShopifyTokenManager(prisma, config, fetchImpl);

  await Promise.all([manager.refresh(store.id), manager.refresh(store.id)]);

  const row = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
  assert.equal(row.tokenVersion, 2, "exactly one CAS update won, not two");
  const finalToken = decryptToken(Buffer.from(row.accessTokenEnc!), key);
  assert.ok(finalToken === "shpat_winner_1" || finalToken === "shpat_winner_2", "row holds a real, current token");
});

test("an invalid refresh marks the Store ERROR, clears credentials, and opens one merchant-visible CHANNEL_SYNC_FAILED exception", async () => {
  const { org, store } = await makeStore("invalid-refresh");
  const manager = new ShopifyTokenManager(prisma, config, fakeRefreshFetch([{ status: 400, body: { error: "invalid_grant" } }]));

  await assert.rejects(() => manager.refresh(store.id));

  const row = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
  assert.equal(row.status, "ERROR");
  assert.equal(row.accessTokenEnc, null);
  assert.equal(row.refreshTokenEnc, null);

  const exceptions = await prisma.exceptionCase.findMany({ where: { organizationId: org.id, code: "CHANNEL_SYNC_FAILED" } });
  assert.equal(exceptions.length, 1);
  assert.equal(exceptions[0].visibility, "MERCHANT");
  assert.equal(exceptions[0].status, "OPEN");

  // withAccessToken now refuses outright — the store needs the merchant to reopen the app (re-bootstrap), not a silent retry.
  await assert.rejects(() => manager.withAccessToken(store.id, async () => "unreachable"), /not ACTIVE/);
});
