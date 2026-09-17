import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRules, type OrderPolicyContext } from "./policy-engine.js";

const baseCtx: OrderPolicyContext = { countryCode: "US", channelFinancialStatus: "paid", skuCodes: ["TEE-RED"], totalItemQuantity: 3 };

test("no rules -> ALLOW", () => {
  assert.equal(evaluateRules([], baseCtx), "ALLOW");
});

test("a HOLD rule whose conditions all match wins", () => {
  const rules = [{ conditions: [{ field: "countryCode", op: "in", values: ["US", "CA"] }], action: "HOLD" }];
  assert.equal(evaluateRules(rules, baseCtx), "HOLD");
});

test("a HOLD rule with one non-matching condition among several does not fire (AND across conditions)", () => {
  const rules = [{
    conditions: [
      { field: "countryCode", op: "in", values: ["US"] },
      { field: "totalItemQuantity", op: ">", value: 10 },
    ],
    action: "HOLD",
  }];
  assert.equal(evaluateRules(rules, baseCtx), "ALLOW");
});

test("priority order matters: an earlier non-matching rule does not block a later matching HOLD", () => {
  const rules = [
    { conditions: [{ field: "countryCode", op: "in", values: ["CA"] }], action: "HOLD" },
    { conditions: [{ field: "containsSku", op: "in", values: ["TEE-RED"] }], action: "HOLD" },
  ];
  assert.equal(evaluateRules(rules, baseCtx), "HOLD");
});

test("an ALLOW rule matching does not suppress a later HOLD rule", () => {
  const rules = [
    { conditions: [{ field: "countryCode", op: "in", values: ["US"] }], action: "ALLOW" },
    { conditions: [{ field: "totalItemQuantity", op: ">=", value: 3 }], action: "HOLD" },
  ];
  assert.equal(evaluateRules(rules, baseCtx), "HOLD");
});

test("a disabled/wrong-trigger rule is the caller's job to filter out — evaluateRules trusts its input list", () => {
  // evaluateRules itself has no enabled/trigger concept; evaluateOrderPolicy's query does the filtering.
  const rules = [{ conditions: [{ field: "countryCode", op: "in", values: ["US"] }], action: "HOLD" }];
  assert.equal(evaluateRules(rules, baseCtx), "HOLD");
});

test("totalItemQuantity supports all four comparators", () => {
  const hold = (op: string, value: number) => evaluateRules([{ conditions: [{ field: "totalItemQuantity", op, value }], action: "HOLD" }], baseCtx);
  assert.equal(hold(">", 2), "HOLD");
  assert.equal(hold(">", 3), "ALLOW");
  assert.equal(hold(">=", 3), "HOLD");
  assert.equal(hold("<", 4), "HOLD");
  assert.equal(hold("<=", 3), "HOLD");
  assert.equal(hold("<=", 2), "ALLOW");
});

test("containsSku matches if any order line's SKU is in the rule's list", () => {
  const rules = [{ conditions: [{ field: "containsSku", op: "in", values: ["OTHER", "TEE-RED"] }], action: "HOLD" }];
  assert.equal(evaluateRules(rules, baseCtx), "HOLD");
});

test("a null countryCode (invalid/unverified address) never matches a countryCode condition", () => {
  const ctx: OrderPolicyContext = { ...baseCtx, countryCode: null };
  const rules = [{ conditions: [{ field: "countryCode", op: "in", values: ["US"] }], action: "HOLD" }];
  assert.equal(evaluateRules(rules, ctx), "ALLOW");
});

test("malformed conditions JSON throws rather than silently allowing or holding", () => {
  const rules = [{ conditions: [{ field: "notARealField" }], action: "HOLD" }];
  assert.throws(() => evaluateRules(rules, baseCtx));
});
