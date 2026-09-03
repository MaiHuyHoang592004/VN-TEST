/**
 * The window that decides which orders count. Pure, so it is tested pure — the
 * reason resolvePeriod takes `now` instead of reading the clock.
 *
 * Run: node --test src/lib/time-period.test.ts (also runs in test:money).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolvePeriod } from "./time-period.ts";

// A Wednesday.
const now = new Date(2026, 6, 22, 15, 30);

test("the default window is this month, not all time", () => {
  const { period, from, to } = resolvePeriod({}, now);
  assert.equal(period, "month");
  assert.deepEqual(from, new Date(2026, 6, 1));
  assert.equal(to?.getDate(), 22);
  assert.equal(to?.getHours(), 23, "the end of the window is the end of the DAY");
});

test("the week starts on Monday", () => {
  const { from } = resolvePeriod({ period: "week" }, now);
  assert.deepEqual(from, new Date(2026, 6, 20), "Wednesday the 22nd belongs to Monday the 20th");
});

test("today is one whole day, not one instant", () => {
  const { from, to } = resolvePeriod({ period: "today" }, now);
  assert.deepEqual(from, new Date(2026, 6, 22));
  assert.equal(to?.getHours(), 23);
  assert.equal(to?.getMinutes(), 59);
});

test("all time has no bounds at all", () => {
  const { from, to } = resolvePeriod({ period: "all" }, now);
  assert.equal(from, undefined);
  assert.equal(to, undefined);
});

test("a custom range covers the whole end day", () => {
  const { from, to } = resolvePeriod(
    { period: "custom", from: "2026-01-05", to: "2026-01-06" },
    now,
  );
  assert.equal(from?.getDate(), 5);
  assert.equal(to?.getDate(), 6);
  assert.equal(to?.getHours(), 23, "an exclusive end silently drops the last day");
});

test("an empty custom range is all time, not an empty result", () => {
  assert.equal(resolvePeriod({ period: "custom" }, now).period, "all");
});

test("a made-up period falls back to the month rather than throwing", () => {
  assert.equal(resolvePeriod({ period: "fortnight" }, now).period, "month");
});
