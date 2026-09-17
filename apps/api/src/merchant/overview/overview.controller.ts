import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ShopifyTenantGuard } from "../../shopify/tenant.guard.js";
import { CurrentTenant } from "../../shopify/current-tenant.decorator.js";
import type { TenantContext } from "../../shopify/tenant-context.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { computeOverview, type OverviewWindow } from "./overview.service.js";

@UseGuards(ShopifyTenantGuard)
@Controller("app/overview")
export class OverviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  get(@Query("window") window: string | undefined, @CurrentTenant() tenant: TenantContext) {
    const w: OverviewWindow = window === "7d" ? "7d" : "24h";
    return computeOverview(this.prisma.client, tenant.organizationId, w);
  }
}
