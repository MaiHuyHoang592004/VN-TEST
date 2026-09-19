/**
 * Keyset (cursor) pagination.
 *
 * OFFSET makes the database count and discard every row it skips, so page 400
 * costs four hundred times page 1 — and a row inserted between two requests
 * shifts the window, so an item can be shown twice or not at all. A cursor
 * naming the last row seen has neither problem, and the cost of a page does
 * not depend on how far in it is.
 *
 * The cursor is opaque on purpose: base64url of "sortValue|id". Callers pass
 * it back unread, so its shape can change without breaking anybody's saved
 * link.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface PageRequest {
  readonly limit?: number | undefined;
  readonly cursor?: string | null | undefined;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface CursorParts {
  /** The sort column's value, as a string. ISO timestamps sort lexically. */
  readonly sortValue: string;
  /** The tie-breaker. Two rows can share a timestamp; they cannot share an id. */
  readonly id: string;
}

/**
 * Clamped rather than rejected. A caller asking for 5000 rows gets 100 and a
 * working response; throwing would turn a caller's optimism into an outage.
 */
export function normalizeLimit(limit?: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.trunc(limit)));
}

export function encodeCursor(parts: CursorParts): string {
  return Buffer.from(`${parts.sortValue}|${parts.id}`, "utf8").toString("base64url");
}

/** Returns null for anything unparseable: a mangled cursor means page one, not a 500. */
export function decodeCursor(cursor: string | null | undefined): CursorParts | null {
  if (!cursor) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const separator = decoded.lastIndexOf("|");
  if (separator <= 0 || separator === decoded.length - 1) return null;
  return { sortValue: decoded.slice(0, separator), id: decoded.slice(separator + 1) };
}

/**
 * Turn `limit + 1` fetched rows into a page.
 *
 * Fetching one extra row is how "is there more?" is answered without a second
 * COUNT query over the same predicate — and a COUNT would be a different
 * snapshot anyway.
 */
export function buildPage<T>(
  rows: readonly T[],
  limit: number,
  toCursor: (row: T) => CursorParts,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows.slice();
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last !== undefined ? encodeCursor(toCursor(last)) : null,
  };
}
