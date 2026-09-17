/**
 * A minimal, merchant-configurable rule engine for the one V1 trigger —
 * ORDER_RECEIVED — sitting alongside (not replacing) the existing "only
 * paid orders create a canonical Order" ingestion policy, which stays a
 * fixed channel-validation rule rather than becoming configurable.
 *
 * `AutomationRule.conditions` is JSONB, validated here rather than at the
 * schema level so a new condition shape never needs a migration.
 */
import { z } from "zod";
import type { Prisma } from "@fulfillflow/db";

const InConditionSchema = <F extends string>(field: F) =>
  z.object({ field: z.literal(field), op: z.literal("in"), values: z.array(z.string().min(1)).min(1) });

const ConditionSchema = z.discriminatedUnion("field", [
  InConditionSchema("countryCode"),
  InConditionSchema("channelFinancialStatus"),
  InConditionSchema("containsSku"),
  z.object({ field: z.literal("totalItemQuantity"), op: z.enum([">", ">=", "<", "<="]), value: z.number().int() }),
]);
export type RuleCondition = z.infer<typeof ConditionSchema>;
export const RuleConditionsSchema = z.array(ConditionSchema);

export const RuleActionSchema = z.enum(["ALLOW", "HOLD"]);
export type RuleAction = z.infer<typeof RuleActionSchema>;

export const RuleTriggerSchema = z.enum(["ORDER_RECEIVED"]);
export type RuleTrigger = z.infer<typeof RuleTriggerSchema>;

export type OrderPolicyContext = {
  countryCode: string | null;
  channelFinancialStatus: string | null;
  skuCodes: string[];
  totalItemQuantity: number;
};

function matchesCondition(condition: RuleCondition, ctx: OrderPolicyContext): boolean {
  switch (condition.field) {
    case "countryCode":
      return ctx.countryCode !== null && condition.values.includes(ctx.countryCode);
    case "channelFinancialStatus":
      return ctx.channelFinancialStatus !== null && condition.values.includes(ctx.channelFinancialStatus);
    case "containsSku":
      return ctx.skuCodes.some((sku) => condition.values.includes(sku));
    case "totalItemQuantity": {
      const n = ctx.totalItemQuantity;
      if (condition.op === ">") return n > condition.value;
      if (condition.op === ">=") return n >= condition.value;
      if (condition.op === "<") return n < condition.value;
      return n <= condition.value;
    }
  }
}

export type EvaluableRule = { conditions: unknown; action: string };

/**
 * Rules are evaluated in the order given — callers sort by priority
 * ascending (lower number first) and filter to enabled=true beforehand,
 * e.g. via evaluateOrderPolicy's own query. The first rule whose conditions
 * all match AND whose action is HOLD wins immediately. A matching ALLOW
 * rule is a no-op: ALLOW is already the default outcome, so an explicit
 * ALLOW rule only documents intent — it never overrides a HOLD a
 * lower-priority rule would otherwise produce, since nothing here says an
 * ALLOW rule should be able to suppress a later match.
 */
export function evaluateRules(rules: EvaluableRule[], ctx: OrderPolicyContext): RuleAction {
  for (const rule of rules) {
    const conditions = RuleConditionsSchema.parse(rule.conditions);
    const action = RuleActionSchema.parse(rule.action);
    if (action === "HOLD" && conditions.every((c) => matchesCondition(c, ctx))) return "HOLD";
  }
  return "ALLOW";
}

export async function evaluateOrderPolicy(tx: Prisma.TransactionClient, organizationId: string, ctx: OrderPolicyContext): Promise<RuleAction> {
  const rules = await tx.automationRule.findMany({
    where: { organizationId, enabled: true, trigger: "ORDER_RECEIVED" as RuleTrigger },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
    select: { conditions: true, action: true },
  });
  return evaluateRules(rules, ctx);
}
