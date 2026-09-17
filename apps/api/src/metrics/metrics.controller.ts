import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { OperatorApiKeyGuard } from "../operator/operator-api-key.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { computeOperationalMetrics } from "./metrics.service.js";

/** Internal operational metrics, JSON only (no Prometheus dependency in V1). Same guard as /operator/**: inert unless OPERATOR_API_KEY is configured. */
@UseGuards(OperatorApiKeyGuard)
@Controller("metrics")
export class MetricsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  get(@Query("windowHours") windowHours?: string) {
    const hours = windowHours ? Number(windowHours) : 24;
    return computeOperationalMetrics(this.prisma.client, Number.isFinite(hours) && hours > 0 ? hours : 24);
  }
}
