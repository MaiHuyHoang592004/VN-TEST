import { test } from "node:test";
import assert from "node:assert/strict";
import { createState, verifyState } from "./oauth-state.js";

const secret = "app-secret";
const shop = "my-shop.myshopify.com";

test("round-trips shop through create/verify", () => {
  const state = createState(shop, secret);
  assert.equal(verifyState(state, shop, secret), true);
});

test("rejects a state for a different shop (CSRF/shop-confusion guard)", () => {
  const state = createState(shop, secret);
  assert.equal(verifyState(state, "other-shop.myshopify.com", secret), false);
});

test("rejects a state signed with a different secret", () => {
  const state = createState(shop, "wrong-secret");
  assert.equal(verifyState(state, shop, secret), false);
});

test("rejects a tampered state string", () => {
  const state = createState(shop, secret);
  assert.equal(verifyState(state.slice(0, -1) + (state.endsWith("a") ? "b" : "a"), shop, secret), false);
});

test("rejects an expired state", () => {
  const state = createState(shop, secret, { nowMs: Date.now() - 15 * 60_000 });
  assert.equal(verifyState(state, shop, secret), false);
});

test("two states for the same shop are not identical (nonce)", () => {
  assert.notEqual(createState(shop, secret), createState(shop, secret));
});
