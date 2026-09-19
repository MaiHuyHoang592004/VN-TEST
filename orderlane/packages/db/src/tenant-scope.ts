/**
 * Tenant isolation, enforced in one place.
 *
 * The alternative is a `where: { tenantId }` on every query, which works right
 * up until the one query that forgets — and that query does not fail, it
 * returns somebody else's data. A leak of that shape is invisible in review,
 * invisible in tests written against a single-tenant fixture, and obvious only
 * to the customer who finds it.
 *
 * So the rule is inverted here: a tenant-scoped model reached through
 * `forTenant()` always carries the filter, the caller cannot override it, and
 * reaching one any other way is a named, greppable act (`systemPrisma`).
 *
 * See docs/design/domain-model.md § Tenant isolation.
 */

/**
 * Every model with a `tenantId` column. Kept as a literal list rather than
 * derived from the schema at runtime so that adding a model and forgetting to
 * think about isolation is a visible omission in a diff, not a silent default.
 * The test in tenant-scope.test.ts fails if the two ever disagree.
 */
export const TENANT_SCOPED_MODELS = [
  "Membership",
  "ApiKey",
  "Product",
  "Variant",
  "Asset",
  "Order",
  "OrderLine",
  "Fulfillment",
  "Shipment",
  "WorkflowDefinition",
  "WorkflowInstance",
  "LedgerAccount",
  "LedgerTransaction",
  "Location",
  "StockItem",
  "StockMovement",
  "ImportJob",
  "ImportRow",
  "Webhook",
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

const SCOPED = new Set<string>(TENANT_SCOPED_MODELS);

export function isTenantScoped(model: string | undefined): model is TenantScopedModel {
  return model !== undefined && SCOPED.has(model);
}

type Args = Record<string, unknown>;

/**
 * Rewrite one operation's arguments so it cannot escape its tenant.
 *
 * `tenantId` is merged LAST in every branch. A caller passing their own
 * `tenantId` — by mistake or otherwise — is overwritten rather than trusted.
 */
export function scopeArgs(operation: string, args: Args, tenantId: string): Args {
  const withTenant = (where: unknown): Args => ({
    ...(typeof where === "object" && where !== null ? (where as Args) : {}),
    tenantId,
  });

  switch (operation) {
    // findUnique takes a unique selector, and Prisma 5+ accepts extra filters
    // alongside it, so the tenant filter composes without rewriting the call
    // into findFirst and changing its null/throw semantics.
    case "findUnique":
    case "findUniqueOrThrow":
    case "findFirst":
    case "findFirstOrThrow":
    case "findMany":
    case "count":
    case "aggregate":
    case "groupBy":
    case "updateMany":
    case "deleteMany":
    case "update":
    case "delete":
      return { ...args, where: withTenant(args["where"]) };

    case "create":
      return { ...args, data: { ...(args["data"] as Args), tenantId } };

    case "createMany":
    case "createManyAndReturn": {
      const data = args["data"];
      const rows = Array.isArray(data) ? data : [data];
      return { ...args, data: rows.map((row) => ({ ...(row as Args), tenantId })) };
    }

    case "upsert":
      return {
        ...args,
        where: withTenant(args["where"]),
        create: { ...(args["create"] as Args), tenantId },
        update: { ...(args["update"] as Args) },
      };

    default:
      // An operation this function does not recognise is refused rather than
      // passed through. A new Prisma operation must be considered here before
      // it can touch tenant data.
      throw new Error(
        `tenant-scope: unhandled operation "${operation}". Add it to scopeArgs() and decide how it is filtered.`,
      );
  }
}
