import type { Actor } from "@orderlane/core/access";
import type { TenantClient } from "@orderlane/db";

// One Actor for the whole system, defined in @orderlane/core. A second
// declaration here would be structurally identical right up until it was not.
export type { Actor };

/**
 * Everything a use case is allowed to know about its caller.
 *
 * `db` is already scoped to `tenantId`: by the time a service runs, the
 * question "is this user a member of this tenant?" has been answered once, at
 * the request boundary, and cannot be answered differently further in.
 */
export interface Ctx {
  readonly tenantId: string;
  readonly actor: Actor;
  readonly db: TenantClient;
}
