/**
 * Row-level scoping — the one place that decides which rows a user may see.
 *
 * Prisma connects as a single database role with rights to every table, so
 * Postgres does NOT keep users apart. A seller is prevented from reading
 * another seller's orders by exactly one thing: the WHERE clause these helpers
 * produce. Every list query MUST spread the scope first, then add its own
 * filters. A `findMany` with no scope is a data-leak bug, reviewed like a
 * missing `await`.
 *
 * Scope comes from the permission suffix (.own / .customer / .all) via
 * scopeFor(), so it is defined once in the policy, not re-derived per page.
 */
import { scopeFor, type SessionUser } from "@opcreative/shared";
import { prisma } from "../client.ts";
// A value import, not `import type`: orderScopeSql builds Prisma.sql fragments.
import { Prisma } from "../generated/prisma/client.ts";

/** A WHERE that matches nothing — the safe default when a user has no access
 * to a resource family at all. Never return `{}` (matches everything) here. */
const MATCH_NONE = { id: { in: [] as number[] } };

/** The physical warehouses a user is a member of (many-to-many). */
export async function memberWarehouseIds(userId: string): Promise<number[]> {
  const rows = await prisma.warehouseMember.findMany({
    where: { userId },
    select: { warehouseId: true },
  });
  return rows.map((r) => r.warehouseId);
}

/**
 * The variant ids a user is restricted to, or null when unrestricted. No
 * UserAllowedProduct rows = no restriction (absence is permissive), matching
 * how the legacy configs.products allow-list behaved.
 */
export async function allowedProductIds(userId: string): Promise<number[] | null> {
  const rows = await prisma.userAllowedProduct.findMany({
    where: { userId },
    select: { productId: true },
  });
  return rows.length ? rows.map((r) => r.productId) : null;
}

/** WHERE fragment restricting Orders to what `user` may read. */
export async function orderScope(user: SessionUser): Promise<Prisma.OrderWhereInput> {
  const scope = scopeFor(user.roles, "orders");
  if (scope === "all") return {};
  if (scope === "customer") {
    const ids = await memberWarehouseIds(user.id);
    return ids.length ? { warehouseId: { in: ids } } : MATCH_NONE;
  }
  if (scope === "own") {
    // A restricted partner is further narrowed to their allowed products.
    const allowed = await allowedProductIds(user.id);
    return allowed
      ? { customerId: user.id, productId: { in: allowed } }
      : { customerId: user.id };
  }
  return MATCH_NONE;
}

/**
 * The same order scope as a SQL fragment, for the queries Prisma cannot
 * express (grouping orders by their shipment's tracking number).
 *
 * It lives HERE, beside orderScope, rather than in the module that needs it:
 * two copies of "which rows may this user see" in two files is precisely the
 * bug this file exists to prevent, and a reviewer changing one will at least
 * see the other. Both read the same scopeFor() + memberWarehouseIds()
 * primitives, so a policy change still happens in one place.
 *
 * Callers must alias the orders table as `o`.
 */
export async function orderScopeSql(user: SessionUser): Promise<Prisma.Sql> {
  const scope = scopeFor(user.roles, "orders");
  if (scope === "all") return Prisma.sql`TRUE`;
  if (scope === "customer") {
    const ids = await memberWarehouseIds(user.id);
    return ids.length ? Prisma.sql`o.warehouse_id = ANY(${ids}::int[])` : Prisma.sql`FALSE`;
  }
  if (scope === "own") {
    const allowed = await allowedProductIds(user.id);
    return allowed
      ? Prisma.sql`o.customer_id = ${user.id} AND o.product_id = ANY(${allowed}::int[])`
      : Prisma.sql`o.customer_id = ${user.id}`;
  }
  return Prisma.sql`FALSE`;
}

/**
 * WHERE fragment restricting Products to what `user` may read.
 *
 * Products have no owner row, so unlike orders the scope is not about roles
 * — it is the partner allow-list and nothing else. A user with no
 * UserAllowedProduct rows sees the whole catalogue (absence is permissive,
 * same rule as allowedProductIds); a restricted partner sees only their rows,
 * on the browse page AND in every variant picker, because both spread this.
 *
 * Callers still add `deletedAt: null` and any status filter themselves — this
 * returns only the isolation clause, so spreading it can never widen a query.
 *
 * Wrapped in AND rather than returned as a bare `{ id: { in } }` because the
 * restriction is on `id`, and the obvious caller — findFirst by id — writes
 * `{ ...scope, id }`, where a bare clause is silently overwritten by the very
 * key it was protecting. That is a data leak that type-checks, reviews clean
 * and only shows up in a scope test. Under AND both survive: Prisma combines
 * top-level keys, so the id filter narrows within the allow-list instead of
 * replacing it.
 */
export async function productScope(user: SessionUser): Promise<Prisma.ProductWhereInput> {
  const allowed = await allowedProductIds(user.id);
  return allowed ? { AND: [{ id: { in: allowed } }] } : {};
}

/** WHERE fragment restricting Transactions to what `user` may read. */
export async function transactionScope(
  user: SessionUser,
): Promise<Prisma.TransactionWhereInput> {
  const scope = scopeFor(user.roles, "transactions");
  if (scope === "all") return {};
  if (scope === "own") return { userId: user.id };
  return { userId: { in: [] } };
}

/**
 * The customer ids a user may see stock, receipts and movements for — or
 * null meaning "every site".
 *
 * Being SITE-BOUND is a property of the actor, not of inventory: the same
 * people who see only their customer's orders see only their customer's
 * shelves. So this reads the answer off the order scope rather than testing
 * role names, which is the thing this file exists to prevent — a second list
 * of "which roles are customer staff" drifts from the first the moment a role
 * is added.
 *
 * Null rather than `{}` because inventory queries filter on several different
 * models (material_stock, warehouse_inventory, movements, receipts), each with
 * its own field name for the customer. Callers turn the ids into their own
 * clause; the policy stays here.
 */
export async function warehouseScopeIds(user: SessionUser): Promise<number[] | null> {
  const scope = scopeFor(user.roles, "orders");
  if (scope === "all") return null;
  if (scope === "customer") return memberWarehouseIds(user.id);
  // Sellers and anyone else with no site: no stock at all. Never fall through
  // to null here — that would hand the whole customer network to a seller.
  return [];
}

/**
 * WHERE fragment restricting any customer-keyed model to the user's sites.
 * Spread it into every inventory read: `where: { ...(await warehouseScope(u)) }`.
 */
export async function warehouseScope(
  user: SessionUser,
): Promise<{ warehouseId?: { in: number[] } }> {
  const ids = await warehouseScopeIds(user);
  return ids === null ? {} : { warehouseId: { in: ids } };
}

/**
 * May this user act on THIS site? The write-side counterpart of
 * warehouseScope: a scope narrows a list, but a mutation names one customer
 * and has to be told no.
 */
export async function canUseWarehouse(
  user: SessionUser,
  warehouseId: number,
): Promise<boolean> {
  const ids = await warehouseScopeIds(user);
  return ids === null || ids.includes(warehouseId);
}

/** WHERE fragment restricting Tickets to what `user` may read. */
export async function ticketScope(user: SessionUser): Promise<Prisma.TicketWhereInput> {
  const scope = scopeFor(user.roles, "tickets");
  if (scope === "all") return {};
  if (scope === "own") return { authorId: user.id };
  return { id: { in: [] } };
}
