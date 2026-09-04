/**
 * The pricing rules, pinned before any order code exists to charge through
 * them. Pure function, no database — every case here is cheap, so there is no
 * excuse for the table below being anything less than exhaustive.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { Prisma } from "@gwprint/db";
import { effectivePrice, type PricedSku } from "./pricing.ts";

const d = (v: string) => new Prisma.Decimal(v);

/** salePrice 30.00, base 12.50, tier 1 12.00, tier 3 11.00 (2 and 4 unset). */
const sku: PricedSku = {
  salePrice: d("30.00"),
  prices: [
    { tier: 0, price: d("12.50") },
    { tier: 1, price: d("12.00") },
    { tier: 3, price: d("11.00") },
  ],
};

test("a seller on a priced tier pays that tier", () => {
  assert.equal(effectivePrice(sku, 1).toFixed(2), "12.00");
  assert.equal(effectivePrice(sku, 3).toFixed(2), "11.00");
});

test("a tier with no column falls back to the tier-0 base price", () => {
  assert.equal(effectivePrice(sku, 2).toFixed(2), "12.50");
  assert.equal(effectivePrice(sku, 4).toFixed(2), "12.50");
});

test("an untiered seller pays the base price, and never nothing", () => {
  // The legacy bug: `price_tier_${null}` produced undefined and the order was
  // free. Both null and undefined must land on tier 0.
  assert.equal(effectivePrice(sku, null).toFixed(2), "12.50");
  assert.equal(effectivePrice(sku, undefined).toFixed(2), "12.50");
});

test("tier 0 asked for explicitly is the base price", () => {
  assert.equal(effectivePrice(sku, 0).toFixed(2), "12.50");
});

test("a tier outside 0-4 falls back rather than throwing", () => {
  // A stale tier on a user column must not take an order down.
  assert.equal(effectivePrice(sku, 99).toFixed(2), "12.50");
  assert.equal(effectivePrice(sku, -1).toFixed(2), "12.50");
});

test("with no tier rows at all, salePrice is the price", () => {
  const bare: PricedSku = { salePrice: d("18.00"), prices: [] };
  assert.equal(effectivePrice(bare, 2).toFixed(2), "18.00");
  assert.equal(effectivePrice(bare, null).toFixed(2), "18.00");
});

test("a tier column survives even when tier 0 is missing", () => {
  const noBase: PricedSku = { salePrice: d("18.00"), prices: [{ tier: 2, price: d("9.00") }] };
  assert.equal(effectivePrice(noBase, 2).toFixed(2), "9.00", "the tier column wins");
  assert.equal(effectivePrice(noBase, 1).toFixed(2), "18.00", "others reach salePrice");
});

test("a price of zero is a PRICE, not a missing value", () => {
  // The `||` trap: a free replacement priced at 0.00 must cost 0.00, not
  // silently fall through to the base price and bill the seller.
  const free: PricedSku = {
    salePrice: d("30.00"),
    prices: [
      { tier: 0, price: d("12.50") },
      { tier: 2, price: d("0.00") },
    ],
  };
  assert.equal(effectivePrice(free, 2).toFixed(2), "0.00");

  const freeBase: PricedSku = { salePrice: d("30.00"), prices: [{ tier: 0, price: d("0.00") }] };
  assert.equal(effectivePrice(freeBase, 1).toFixed(2), "0.00", "a zero base is still the base");
});

test("money stays Decimal end to end — no float ever touches it", () => {
  const awkward: PricedSku = {
    salePrice: d("0.30"),
    prices: [{ tier: 0, price: d("0.10") }, { tier: 1, price: d("0.20") }],
  };
  const sum = effectivePrice(awkward, 0).add(effectivePrice(awkward, 1));
  assert.ok(sum instanceof Prisma.Decimal, "returns a Decimal, not a number");
  assert.equal(sum.toFixed(2), "0.30");
  // The reason this file refuses to use JS numbers, stated as an assertion.
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.ok(sum.equals(d("0.30")));
});

test("a quantity charge multiplies without drift", () => {
  // What assignOrders will actually do: price × quantity, 3 × 12.10 = 36.30.
  const line = effectivePrice({ salePrice: d("0"), prices: [{ tier: 0, price: d("12.10") }] }, 0);
  assert.equal(line.mul(3).toFixed(2), "36.30");
  // Not every float multiplication drifts — 12.1 * 3 happens to be exact,
  // which is precisely why "it looked right when I tried it" is not a
  // strategy. This one, a tenth taken three times, does not survive.
  assert.notEqual(0.1 * 3, 0.3);
  assert.equal(d("0.10").mul(3).toFixed(2), "0.30");
});
