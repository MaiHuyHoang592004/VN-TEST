import { Module } from "@nestjs/common";
import { ShopifyConfig } from "./shopify-config.provider.js";
import { OAuthController } from "./oauth.controller.js";

@Module({
  controllers: [OAuthController],
  providers: [ShopifyConfig],
})
export class ShopifyModule {}
