import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module.js";
import { HealthController } from "./health/health.controller.js";
import { ReadinessController } from "./health/readiness.controller.js";
import { MetricsController } from "./metrics/metrics.controller.js";
import { correlationMiddleware } from "./observability/correlation.middleware.js";
import { ShopifyModule } from "./shopify/shopify.module.js";
import { OperatorModule } from "./operator/operator.module.js";
import { MerchantModule } from "./merchant/merchant.module.js";

@Module({
  imports: [PrismaModule, ShopifyModule, OperatorModule, MerchantModule],
  controllers: [HealthController, ReadinessController, MetricsController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(correlationMiddleware).forRoutes("*");
  }
}
