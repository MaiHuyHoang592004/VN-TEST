/**
 * Turns a verified embedded-app session (shop + Shopify staff user id) plus a
 * completed token exchange into durable rows: one Organization per shop (this
 * app has no separate merchant sign-up flow — the shop IS the tenant), one
 * User per Shopify staff id, one OWNER membership, and one Store row with the
 * offline token(s) encrypted at rest. Everything is upserted on natural
 * unique keys, so bootstrapping the same shop+user twice is a no-op, not a
 * duplicate — managed installation re-runs this on every "first open" until
 * a Store exists.
 */
import type { PrismaClient } from "@fulfillflow/db";
import { encryptToken, type TokenResponse } from "@fulfillflow/core";

export type BootstrapInput = {
  shop: string;
  shopifyUserId: string;
  tokens: TokenResponse;
  tokenEncKey: string;
};
export type BootstrapResult = { organizationId: string; storeId: string; userId: string; shopDomain: string };

function expiryDate(seconds: number | undefined): Date | null {
  return typeof seconds === "number" ? new Date(Date.now() + seconds * 1000) : null;
}

export async function bootstrapShopifyStore(prisma: PrismaClient, input: BootstrapInput): Promise<BootstrapResult> {
  const organization = await prisma.organization.upsert({
    where: { slug: input.shop },
    update: {},
    create: { name: input.shop, slug: input.shop },
  });

  // The ID token's `sub` is the only stable identity we get for the Shopify
  // staff member; it carries no email, so this is a synthetic placeholder,
  // not a real address — deterministic per (user, shop) so re-bootstrapping
  // never collides.
  const user = await prisma.user.upsert({
    where: { shopifyUserId: input.shopifyUserId },
    update: {},
    create: {
      shopifyUserId: input.shopifyUserId,
      email: `shopify-user-${input.shopifyUserId}@${input.shop}`,
      name: `Shopify user ${input.shopifyUserId}`,
    },
  });

  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    update: {},
    create: { organizationId: organization.id, userId: user.id, role: "OWNER" },
  });

  const accessTokenEnc = new Uint8Array(encryptToken(input.tokens.accessToken, input.tokenEncKey));
  const refreshTokenEnc = input.tokens.refreshToken
    ? new Uint8Array(encryptToken(input.tokens.refreshToken, input.tokenEncKey))
    : undefined;
  const accessTokenExpiresAt = expiryDate(input.tokens.accessTokenExpiresInSeconds);
  const refreshTokenExpiresAt = expiryDate(input.tokens.refreshTokenExpiresInSeconds);

  const store = await prisma.store.upsert({
    where: { provider_externalStoreId: { provider: "SHOPIFY", externalStoreId: input.shop } },
    create: {
      organizationId: organization.id,
      provider: "SHOPIFY",
      name: input.shop,
      externalStoreId: input.shop,
      status: "ACTIVE",
      accessTokenEnc,
      refreshTokenEnc,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      grantedScopes: input.tokens.scope,
      tokenVersion: 1,
      installedAt: new Date(),
    },
    update: {
      status: "ACTIVE",
      accessTokenEnc,
      refreshTokenEnc,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      grantedScopes: input.tokens.scope,
      tokenVersion: { increment: 1 },
      uninstalledAt: null,
    },
  });

  return { organizationId: organization.id, storeId: store.id, userId: user.id, shopDomain: input.shop };
}
