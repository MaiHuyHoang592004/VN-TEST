/**
 * The handful of things every order file needs. Deliberately tiny: a `shared`
 * module that grows becomes the junk drawer modules/README.md bans, so
 * anything with real behaviour belongs in the act that owns it.
 */
import { type AuditContext, type FulfillmentStatus, type Prisma } from "@gwprint/db";

export type Actor = NonNullable<AuditContext["actor"]>;

/** A form posts "" for an untouched optional field; the row wants null.
 * Storing "" instead means `WHERE note IS NULL` quietly misses rows. */
export const blankToNull = (v?: string | null) => (v && v.length ? v : null);

/** Where an ON_HOLD order returns to. Kept in configs so the status map stays
 * pure data and doesn't need a row of its own. */
export type OrderConfigs = { resumeTo?: FulfillmentStatus } & Record<string, unknown>;

export const resumeTargetOf = (configs: Prisma.JsonValue | null): FulfillmentStatus | null =>
  (configs as OrderConfigs | null)?.resumeTo ?? null;

/**
 * What the orders table may sort by — the whitelist `?sort=` is checked
 * against, and the list the header cells are built from.
 *
 * It lives HERE, in the one module in this feature that a CLIENT component can
 * import, and not beside the Prisma orderBy map in service/reads.ts that
 * consumes it. reads.ts value-imports the database client; a "use client"
 * table importing the list from there would pull Prisma into the browser
 * bundle. This file's only import is type-only, so it erases at build.
 *
 * Two copies of this list is the failure this placement exists to prevent: a
 * column you can click that the server then silently ignores reports as
 * "sorting doesn't work" and reads like a caching bug for an afternoon.
 * service/reads.ts maps each key to its orderBy — including the two that are
 * relation walks — and rejects everything else.
 */
export const ORDER_SORT_KEYS = [
  "placedAt",
  "deadline",
  "updatedAt",
  "quantity",
  "baseCost",
  "status",
  "customerName",
  "warehouseCode",
] as const;

export type OrderSortKey = (typeof ORDER_SORT_KEYS)[number];
