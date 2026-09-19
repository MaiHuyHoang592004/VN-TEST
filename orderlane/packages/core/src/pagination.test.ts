import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPage,
  decodeCursor,
  encodeCursor,
  normalizeLimit,
} from "./pagination.ts";

test("a limit is clamped, not rejected", () => {
  assert.equal(normalizeLimit(undefined), DEFAULT_PAGE_SIZE);
  assert.equal(normalizeLimit(10), 10);
  assert.equal(normalizeLimit(5000), MAX_PAGE_SIZE, "optimism should not become an outage");
  assert.equal(normalizeLimit(0), 1);
  assert.equal(normalizeLimit(-3), 1);
  assert.equal(normalizeLimit(12.7), 12);
  assert.equal(normalizeLimit(Number.NaN), DEFAULT_PAGE_SIZE);
});

test("a cursor round-trips", () => {
  const parts = { sortValue: "2026-09-19T08:00:00.000Z", id: "clx123" };
  assert.deepEqual(decodeCursor(encodeCursor(parts)), parts);
});

test("a sort value containing the separator still round-trips", () => {
  // The id cannot contain "|", so splitting on the LAST one is unambiguous
  // even when the sort value is a free string that does.
  const parts = { sortValue: "a|b|c", id: "clx123" };
  assert.deepEqual(decodeCursor(encodeCursor(parts)), parts);
});

test("a mangled cursor means page one, not an error", () => {
  assert.equal(decodeCursor(null), null);
  assert.equal(decodeCursor(""), null);
  assert.equal(decodeCursor("not-base64-at-all!!"), null);
  assert.equal(decodeCursor(Buffer.from("nopipe", "utf8").toString("base64url")), null);
  assert.equal(decodeCursor(Buffer.from("|id", "utf8").toString("base64url")), null);
  assert.equal(decodeCursor(Buffer.from("sort|", "utf8").toString("base64url")), null);
});

test("a full page reports more, and hands back a cursor for the last item", () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ id: `id${i}`, at: `2026-09-1${i}` }));
  const page = buildPage(rows, 5, (r) => ({ sortValue: r.at, id: r.id }));

  assert.equal(page.items.length, 5, "the extra row is the probe, not content");
  assert.equal(page.hasMore, true);
  assert.deepEqual(decodeCursor(page.nextCursor), { sortValue: "2026-09-14", id: "id4" });
});

test("a short page reports no more and no cursor", () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({ id: `id${i}`, at: `x${i}` }));
  const page = buildPage(rows, 5, (r) => ({ sortValue: r.at, id: r.id }));
  assert.equal(page.items.length, 3);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);
});

test("an empty result is a page, not a special case", () => {
  const page = buildPage([], 5, () => ({ sortValue: "", id: "" }));
  assert.deepEqual(page, { items: [], hasMore: false, nextCursor: null });
});

test("paging through a set visits every row exactly once", () => {
  const all = Array.from({ length: 23 }, (_, i) => ({
    id: `id${String(i).padStart(2, "0")}`,
    at: `2026-09-19T00:00:${String(i).padStart(2, "0")}.000Z`,
  }));
  const limit = 5;
  const seen: string[] = [];
  let cursor: string | null = null;

  for (let guard = 0; guard < 10; guard++) {
    const after = decodeCursor(cursor);
    // The same predicate a keyset query would use: strictly after (at, id).
    const rows = all
      .filter((r) => after === null || r.at > after.sortValue || (r.at === after.sortValue && r.id > after.id))
      .slice(0, limit + 1);
    const page = buildPage(rows, limit, (r) => ({ sortValue: r.at, id: r.id }));
    seen.push(...page.items.map((r) => r.id));
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }

  assert.equal(seen.length, 23);
  assert.equal(new Set(seen).size, 23, "no row appears twice");
  assert.deepEqual(seen, all.map((r) => r.id), "and none is skipped");
});
