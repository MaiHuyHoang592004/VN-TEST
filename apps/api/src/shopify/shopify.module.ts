import { Module } from "@nestjs/common";
import { ShopifyConfig } from "./shopify-config.provider.js";
import { OAuthController } from "./oauth.controller.js";
import { SessionController } from "./session.controller.js";

@Module({
  controllers: [OAuthController, SessionController],
  providers: [ShopifyConfig],
})
export class ShopifyModule {}
