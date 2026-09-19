import { buildPage, decodeCursor, normalizeLimit, type CursorParts, type Page, type PageRequest } from "@orderlane/core/pagination";

/**
 * The Prisma half of keyset pagination. The cursor's encoding lives in
 * @orderlane/core (pure, tested without a database); this turns a decoded
 * cursor into a `where` fragment.
 */

export interface KeysetQuery {
  readonly take: number;
  readonly where: Record<string, unknown>;
  readonly after: CursorParts | null;
}

/**
 * Builds the strict-inequality predicate on `(sortField, id)`.
 *
 * The tie-breaker on `id` is not decoration: two orders placed in the same
 * millisecond would otherwise straddle a page boundary, and one of them would
 * be shown twice or never. Any keyset sort needs a unique last column.
 */
export function keysetQuery(
  request: PageRequest,
  sortField: string,
  direction: "asc" | "desc" = "desc",
): KeysetQuery {
  const take = normalizeLimit(request.limit);
  const after = decodeCursor(request.cursor);
  if (!after) return { take: take + 1, where: {}, after: null };

  const op = direction === "desc" ? "lt" : "gt";
  const boundary = parseSortValue(after.sortValue);

  return {
    take: take + 1,
    after,
    where: {
      OR: [
        { [sortField]: { [op]: boundary } },
        { [sortField]: boundary, id: { [op]: after.id } },
      ],
    },
  };
}

/** ISO timestamps become Dates; everything else stays a string. */
function parseSortValue(value: string): Date | string {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : value;
}

export function toPage<T extends { id: string }>(
  rows: readonly T[],
  take: number,
  sortValueOf: (row: T) => Date | string,
): Page<T> {
  return buildPage(rows, take - 1, (row) => {
    const value = sortValueOf(row);
    return { sortValue: value instanceof Date ? value.toISOString() : value, id: row.id };
  });
}

export type { Page, PageRequest };
