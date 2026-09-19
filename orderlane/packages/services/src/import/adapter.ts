import type { ImportAdapter, RowValues } from "@orderlane/core/import";
import type { ImportKind } from "@orderlane/db";

import type { TenantTx } from "@orderlane/db";

import type { Ctx } from "../context.ts";

/**
 * The persistence half of an import adapter.
 *
 * @orderlane/core owns the pure half — parsing, validation, which fields make
 * up a row's identity — and knows nothing about a database. This adds the one
 * operation that must: applying a validated row.
 *
 * `apply` receives a transaction the caller owns rather than opening one. That
 * is what lets the commit step write the row's effect and the record that it
 * was applied as a single unit — the record is the uniqueness guarantee, and
 * a guarantee written in a separate transaction guarantees nothing.
 *
 * The caller still runs one transaction per ROW. A batch-wide one would mean
 * row 500 failing rolls back 499 successes, which is what staging exists to
 * prevent.
 */
export interface PersistedImportAdapter<T extends RowValues = RowValues> extends ImportAdapter<T> {
  readonly kind: ImportKind;
  /** Returns the id of the row it created or updated. */
  apply(tx: TenantTx, ctx: Ctx, values: T): Promise<string>;
}
