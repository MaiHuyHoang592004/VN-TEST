import { Module } from "@nestjs/common";
import { prisma } from "@fulfillflow/db";
import { ShopifyConfig } from "./shopify-config.provider.js";
import { SessionController } from "./session.controller.js";
import { WebhooksController } from "./webhooks.controller.js";
import { ShopifyTenantGuard } from "./tenant.guard.js";
import { ShopifyTokenManager } from "./token-manager.js";

export const SHOPIFY_TOKEN_MANAGER = Symbol("SHOPIFY_TOKEN_MANAGER");

@Module({
  controllers: [SessionController, WebhooksController],
  providers: [
    ShopifyConfig,
    ShopifyTenantGuard,
    {
      provide: SHOPIFY_TOKEN_MANAGER,
      inject: [ShopifyConfig],
      // No consumer yet in M2 (no Admin API calls happen this milestone) —
      // registered so M2.5/M3's handlers can inject it rather than
      // constructing their own.
      useFactory: (config: ShopifyConfig) =>
        new ShopifyTokenManager(prisma, { apiKey: config.apiKey, apiSecret: config.apiSecret, tokenEncKey: config.tokenEncKey }),
    },
  ],
  exports: [SHOPIFY_TOKEN_MANAGER],
})
export class ShopifyModule {}
