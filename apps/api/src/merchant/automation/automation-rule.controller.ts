import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ShopifyTenantGuard } from "../../shopify/tenant.guard.js";
import { CurrentTenant } from "../../shopify/current-tenant.decorator.js";
import type { TenantContext } from "../../shopify/tenant-context.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { MerchantWriteRateLimitGuard } from "../merchant-write-rate-limit.guard.js";
import {
  listAutomationRules, createAutomationRule, updateAutomationRule, deleteAutomationRule,
  CreateAutomationRuleSchema, UpdateAutomationRuleSchema,
} from "./automation-rule.service.js";

/** Tenant-scoped CRUD for merchant automation rules (Policy Engine, M7 Task 25/26). Every read/write is scoped to TenantContext.organizationId, never a request body/query id. */
@UseGuards(ShopifyTenantGuard)
@Controller("app/automation-rules")
export class AutomationRuleController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return listAutomationRules(this.prisma.client, tenant.organizationId);
  }

  @Post()
  @UseGuards(MerchantWriteRateLimitGuard)
  @HttpCode(201)
  create(@Body() body: unknown, @CurrentTenant() tenant: TenantContext) {
    const parsed = CreateAutomationRuleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return createAutomationRule(this.prisma.client, tenant.organizationId, parsed.data, tenant.userId || undefined);
  }

  @Patch(":id")
  @UseGuards(MerchantWriteRateLimitGuard)
  update(@Param("id") id: string, @Body() body: unknown, @CurrentTenant() tenant: TenantContext) {
    const parsed = UpdateAutomationRuleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return updateAutomationRule(this.prisma.client, tenant.organizationId, id, parsed.data, tenant.userId || undefined);
  }

  @Delete(":id")
  @UseGuards(MerchantWriteRateLimitGuard)
  @HttpCode(204)
  async remove(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    await deleteAutomationRule(this.prisma.client, tenant.organizationId, id, tenant.userId || undefined);
  }
}
