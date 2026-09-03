/**
 * The handful of things every order file needs. Deliberately tiny: a `shared`
 * module that grows becomes the junk drawer modules/README.md bans, so
 * anything with real behaviour belongs in the act that owns it.
 */
import { type AuditContext, type FulfillmentStatus, type Prisma } from "@opcreative/db";

export type Actor = NonNullable<AuditContext["actor"]>;

/** A form posts "" for an untouched optional field; the row wants null.
 * Storing "" instead means `WHERE note IS NULL` quietly misses rows. */
export const blankToNull = (v?: string | null) => (v && v.length ? v : null);

/** Where an ON_HOLD order returns to. Kept in configs so the status map stays
 * pure data and doesn't need a row of its own. */
export type OrderConfigs = { resumeTo?: FulfillmentStatus } & Record<string, unknown>;

export const resumeTargetOf = (configs: Prisma.JsonValue | null): FulfillmentStatus | null =>
  (configs as OrderConfigs | null)?.resumeTo ?? null;
