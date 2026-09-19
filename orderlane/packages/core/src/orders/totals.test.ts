import { test } from "node:test";
import assert from "node:assert/strict";

import { checkDeclaredTotals, lineTotalMinor, subtotalMinor, totalMinor, validateAmounts } from "./totals.ts";

const lines = [
  { quantity: 2, unitPriceMinor: 1_250 },
  { quantity: 1, unitPriceMinor: 3_400 },
];

test("totals are exact integer arithmetic", () => {
  assert.equal(lineTotalMinor(lines[0]!), 2_500);
  assert.equal(subtotalMinor(lines), 5_900);
  assert.equal(totalMinor(lines, 499), 6_399);
});

test("a price a float would get wrong is exact here", () => {
  // 0.1 + 0.2 in cents is 10 + 20. In floats it is 0.30000000000000004.
  const cents = [{ quantity: 1, unitPriceMinor: 10 }, { quantity: 1, unitPriceMinor: 20 }];
  assert.equal(subtotalMinor(cents), 30);
});

test("a well-formed order has no issues", () => {
  assert.deepEqual(validateAmounts(lines, 499), []);
});

test("a zero-price line is allowed; a negative one is not", () => {
  assert.deepEqual(validateAmounts([{ quantity: 1, unitPriceMinor: 0 }]), [], "a free gift line is a real thing");
  const issues = validateAmounts([{ quantity: 1, unitPriceMinor: -100 }]);
  assert.deepEqual(issues.map((i) => i.code), ["negative_unit_price"]);
  assert.equal(issues[0]!.lineIndex, 0);
});

test("quantity must be a positive integer, and the issue names the line", () => {
  const issues = validateAmounts([
    { quantity: 1, unitPriceMinor: 100 },
    { quantity: 0, unitPriceMinor: 100 },
    { quantity: 1.5, unitPriceMinor: 100 },
  ]);
  assert.deepEqual(issues.map((i) => [i.code, i.lineIndex]), [
    ["non_positive_quantity", 1],
    ["non_positive_quantity", 2],
  ]);
});

test("an order with no lines, and negative postage, are both rejected", () => {
  assert.deepEqual(validateAmounts([]).map((i) => i.code), ["no_lines"]);
  assert.ok(validateAmounts(lines, -100).some((i) => i.code === "negative_shipping"));
});

test("a total the schema's Int column cannot hold is caught here, not by Postgres", () => {
  const issues = validateAmounts([{ quantity: 1_000_000, unitPriceMinor: 1_000_000 }]);
  assert.deepEqual(issues.map((i) => i.code), ["amount_overflow"]);
});

test("declared totals are checked, not trusted", () => {
  assert.deepEqual(checkDeclaredTotals(lines, { subtotalMinor: 5_900, shippingMinor: 499, totalMinor: 6_399 }), []);

  const wrong = checkDeclaredTotals(lines, { subtotalMinor: 5_000, shippingMinor: 499, totalMinor: 5_499 });
  assert.equal(wrong.length, 2, "both the subtotal and the total disagree with the lines");
  assert.ok(wrong.every((i) => i.code === "total_mismatch"));
});
