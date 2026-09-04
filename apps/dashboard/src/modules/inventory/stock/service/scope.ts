/**
 * Which sites an actor may read and write. The inventory half of scopes.ts —
 * the policy itself lives there, this turns it into the two shapes the domain
 * needs: a WHERE for reads, and a refusal for writes.
 */
import { warehouseScopeIds, type AuditContext } from "@gwprint/db";

import { InventoryError } from "./errors.ts";

export type Actor = NonNullable<AuditContext["actor"]>;

/**
 * Refuse a mutation aimed at a site the actor is not a member of.
 *
 * Guarding the LIST is not enough: a customer user who can see site A's page
 * can still post site B's id to the action, and an id from a client is not
 * authorization. ADMIN and SUPPORT are site-unbounded (warehouseScopeIds
 * returns null) — deliberately, because head office corrects counts anywhere.
 */
export async function assertSite(actor: Actor, warehouseId: number): Promise<void> {
  const ids = await warehouseScopeIds(actor);
  if (ids !== null && !ids.includes(warehouseId)) {
    throw new InventoryError(
      "customer-not-allowed",
      "You are not a member of that customer.",
      { warehouseId },
    );
  }
}

/**
 * The customer ids a read may cover: the actor's sites, narrowed by any
 * requested one. Null means every site.
 *
 * A requested site the actor cannot see narrows to `[]` — matching nothing —
 * rather than being dropped. Dropping it would silently widen the query to
 * every site the actor CAN see, which reads as a working filter and isn't one.
 */
export async function readableSites(
  actor: Actor,
  warehouseId?: number,
): Promise<number[] | null> {
  const ids = await warehouseScopeIds(actor);
  if (warehouseId === undefined) return ids;
  if (ids !== null && !ids.includes(warehouseId)) return [];
  return [warehouseId];
}

export const siteWhere = (ids: number[] | null) =>
  ids === null ? {} : { warehouseId: { in: ids } };
