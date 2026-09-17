import { Module } from "@nestjs/common";
import { ShopifyModule } from "../shopify/shopify.module.js";
import { AutomationRuleController } from "./automation/automation-rule.controller.js";
import { OverviewController } from "./overview/overview.controller.js";

@Module({ imports: [ShopifyModule], controllers: [AutomationRuleController, OverviewController] })
export class MerchantModule {}
