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
  "BalanceSnapshot",
  "FulfillmentLine",
  "LedgerEntry",
  "Membership",
  "ApiKey",
  "Product",
  "Variant",
  "Asset",
  "Order",
  "OrderLine",
  "Fulfillment",
  "Shipment",
  "TransitionLog",
  "WorkflowDefinition",
  "WorkflowInstance",
  "WorkflowState",
  "WorkflowTransition",
  "LedgerAccount",
  "LedgerTransaction",
  "Location",
  "StockItem",
  "StockMovement",
  "ImportApplication",
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
 * Strip `tenantId` from an update payload.
 *
 * The filter on `where` stops a caller READING across the boundary; this stops
 * them MOVING a row across it. `update({ where: { id }, data: { tenantId } })`
 * passes the where-clause check — the row really is theirs — and then hands it
 * to somebody else.
 *
 * No call site forwards a user-supplied `data` object today, so this is not a
 * live hole. It is here because these packages are meant to be built on, and
 * "a caller cannot widen its own scope" should be true of the mechanism rather
 * than true by inspection of the current callers.
 *
 * Creates are not stripped: there the tenant id is MERGED, overwriting whatever
 * was passed, which is the same guarantee reached the other way round.
 */
function withoutTenantId(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  if (Array.isArray(data)) return data.map(withoutTenantId);
  if (!("tenantId" in data)) return data;
  const { tenantId: _discarded, ...rest } = data as Args;
  return rest;
}

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
    case "deleteMany":
    case "delete":
      return { ...args, where: withTenant(args["where"]) };

    // Updates get the filter AND lose any tenantId in their payload: the
    // filter proves the row is theirs, and stripping stops them giving it away.
    case "update":
    case "updateMany":
      return { ...args, where: withTenant(args["where"]), data: withoutTenantId(args["data"]) };

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
        update: withoutTenantId(args["update"]),
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
