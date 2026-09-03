import { test } from "node:test";
import assert from "node:assert/strict";

import { STATUS_TONES, toneFor } from "./status-tones.ts";

test("maps the canonical DS statuses to their documented tones", () => {
  // Verbatim from docs/design-system/tokens/status-tones.json — the DS calls
  // these seven tones canonical for all UI (ALIGNMENT_AUDIT §T4).
  assert.equal(toneFor("Fulfilled"), "success");
  assert.equal(toneFor("Delivered"), "success");
  assert.equal(toneFor("In Production"), "progress");
  assert.equal(toneFor("Shipped"), "info");
  assert.equal(toneFor("Pending"), "pending");
  assert.equal(toneFor("Production Ready"), "pending");
  assert.equal(toneFor("Design problems"), "attention");
  assert.equal(toneFor("Low Stock"), "attention");
  assert.equal(toneFor("Cancel"), "critical");
  assert.equal(toneFor("Out Of Stock"), "critical");
  assert.equal(toneFor("Processing"), "neutral");
  assert.equal(toneFor("Validating"), "neutral");
});

test("maps the ticket lifecycle statuses", () => {
  assert.equal(toneFor("open"), "attention");
  assert.equal(toneFor("in_progress"), "progress");
  assert.equal(toneFor("closed"), "success");
});

test("matches statuses irrespective of case and separator", () => {
  // The DB enum is SCREAMING_SNAKE (FulfillmentStatus), the DS map is
  // Title Case prose. Both must land on the same tone or the badge colour
  // depends on which layer handed us the string.
  assert.equal(toneFor("IN_PRODUCTION"), "progress");
  assert.equal(toneFor("in production"), "progress");
  assert.equal(toneFor("OUT_OF_STOCK"), "critical");
  assert.equal(toneFor("ON_HOLD"), "attention");
});

test("falls back to neutral for an unknown or empty status", () => {
  // Never throw and never invent a colour: an unrecognised status is grey.
  assert.equal(toneFor("Some Status The Backend Added Today"), "neutral");
  assert.equal(toneFor(""), "neutral");
  assert.equal(toneFor(null), "neutral");
  assert.equal(toneFor(undefined), "neutral");
});

test("exposes the raw DS map for the adherence check", () => {
  assert.equal(STATUS_TONES["Fulfilled"], "success");
  assert.equal(Object.keys(STATUS_TONES).length >= 26, true);
});
