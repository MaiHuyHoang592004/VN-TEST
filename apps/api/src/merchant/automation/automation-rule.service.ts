import { NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@fulfillflow/db";
import { RuleConditionsSchema, RuleActionSchema, RuleTriggerSchema } from "@fulfillflow/core";
import { z } from "zod";

type Tx = Prisma.TransactionClient | PrismaClient;

export const CreateAutomationRuleSchema = z.object({
  name: z.string().min(1),
  trigger: RuleTriggerSchema,
  conditions: RuleConditionsSchema,
  action: RuleActionSchema,
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});
export type CreateAutomationRuleInput = z.infer<typeof CreateAutomationRuleSchema>;

export const UpdateAutomationRuleSchema = CreateAutomationRuleSchema.partial();
export type UpdateAutomationRuleInput = z.infer<typeof UpdateAutomationRuleSchema>;

export async function listAutomationRules(prisma: PrismaClient, organizationId: string) {
  return prisma.automationRule.findMany({ where: { organizationId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
}

async function loadOwned(prisma: Tx, organizationId: string, id: string) {
  const rule = await prisma.automationRule.findFirst({ where: { id, organizationId } });
  if (!rule) throw new NotFoundException("automation rule not found");
  return rule;
}

export async function createAutomationRule(prisma: PrismaClient, organizationId: string, input: CreateAutomationRuleInput, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.automationRule.create({ data: { organizationId, ...input } });
    await tx.auditLog.create({ data: {
      organizationId, actorId, action: "automation_rule.create", entityType: "AutomationRule", entityId: rule.id, after: rule,
    } });
    return rule;
  });
}

export async function updateAutomationRule(prisma: PrismaClient, organizationId: string, id: string, input: UpdateAutomationRuleInput, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AutomationRule" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const before = await loadOwned(tx, organizationId, id);
    const updated = await tx.automationRule.update({ where: { id }, data: input });
    await tx.auditLog.create({ data: {
      organizationId, actorId, action: "automation_rule.update", entityType: "AutomationRule", entityId: id, before, after: updated,
    } });
    return updated;
  });
}

export async function deleteAutomationRule(prisma: PrismaClient, organizationId: string, id: string, actorId?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await loadOwned(tx, organizationId, id);
    await tx.automationRule.delete({ where: { id } });
    await tx.auditLog.create({ data: {
      organizationId, actorId, action: "automation_rule.delete", entityType: "AutomationRule", entityId: id, before,
    } });
  });
}
