/**
 * Turns a completed Shopify OAuth grant into durable rows: one Organization
 * per shop (this app has no separate merchant sign-up flow — the shop IS the
 * tenant) and one Store row, upserted on (provider, externalStoreId) so a
 * reinstall reuses the same tenant instead of creating a duplicate.
 */
import type { PrismaClient } from "@fulfillflow/db";
import { encryptToken } from "./token-crypto.js";

export type BootstrapInput = { shop: string; accessToken: string; scope: string; tokenEncKey: string };
export type BootstrapResult = { organizationId: string; storeId: string };

export async function bootstrapShopifyStore(prisma: PrismaClient, input: BootstrapInput): Promise<BootstrapResult> {
  const organization = await prisma.organization.upsert({
    where: { slug: input.shop },
    update: {},
    create: { name: input.shop, slug: input.shop },
  });

  const accessTokenEnc = encryptToken(input.accessToken, input.tokenEncKey);
  const store = await prisma.store.upsert({
    where: { provider_externalStoreId: { provider: "SHOPIFY", externalStoreId: input.shop } },
    create: {
      organizationId: organization.id,
      provider: "SHOPIFY",
      name: input.shop,
      externalStoreId: input.shop,
      status: "ACTIVE",
      accessTokenEnc,
      grantedScopes: input.scope,
      tokenVersion: 1,
      installedAt: new Date(),
    },
    update: {
      status: "ACTIVE",
      accessTokenEnc,
      grantedScopes: input.scope,
      tokenVersion: { increment: 1 },
      uninstalledAt: null,
    },
  });

  return { organizationId: organization.id, storeId: store.id };
}
