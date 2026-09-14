/** Worker-side Shopify Admin API access: the one ShopifyTokenManager instance every M5 handler shares. */
import { prisma } from "@fulfillflow/db";
import { ShopifyTokenManager } from "@fulfillflow/core";
import { loadEnv } from "../../config/env.js";

const env = loadEnv();
export const shopifyTokenManager = new ShopifyTokenManager(prisma, {
  apiKey: env.SHOPIFY_API_KEY,
  apiSecret: env.SHOPIFY_API_SECRET,
  tokenEncKey: env.SHOPIFY_TOKEN_ENC_KEY,
});
