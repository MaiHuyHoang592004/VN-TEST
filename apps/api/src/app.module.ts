import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module.js";
import { HealthController } from "./health/health.controller.js";
import { ShopifyModule } from "./shopify/shopify.module.js";

@Module({ imports: [PrismaModule, ShopifyModule], controllers: [HealthController] })
export class AppModule {}
