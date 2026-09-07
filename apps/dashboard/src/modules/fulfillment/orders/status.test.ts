/**
 * The edit window, as rules rather than as prose.
 *
 * `editableAt` is the one place that answers "may this order still be changed",
 * and TWO surfaces ask it — the dashboard's updateOrder and the public API's
 * patchOrder. A table both read is only worth having if the table is right, so
 * the cases that decide the money and the ON_HOLD carve-out are pinned here.
 *
 * Pure: no database, no scratch schema. Run with
 *   node --test src/modules/fulfillment/orders/status.test.ts
 * from apps/dashboard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { BEFORE_PRODUCTION, editableAt, PROCESSING, TERMINAL } from "./status.ts";

const STAFF = true;
const SELLER = false;

test("staff edit until the piece is on a machine, and not one step further", () => {
  assert.equal(editableAt("PENDING", STAFF), true);
  assert.equal(editableAt("ASSIGNED", STAFF), true, "assigned but not yet started");
  // The line. Past here somebody has cut, printed or engraved against what the
  // order said, and editing it would describe a piece that does not exist.
  assert.equal(editableAt("IN_PRODUCTION", STAFF), false);
  assert.equal(editableAt("FULFILLED", STAFF), false);
  assert.equal(editableAt("SHIPPED", STAFF), false);
  assert.equal(editableAt("DELIVERED", STAFF), false);
  assert.equal(editableAt("CANCELLED", STAFF), false);
  assert.equal(editableAt("REFUNDED", STAFF), false);
});

test("a seller's window closes a step earlier — at the moment money moves", () => {
  assert.equal(editableAt("PENDING", SELLER), true);
  // ASSIGNED is where assignOrders debits the seller's wallet and the job
  // enters a queue somebody works from. Their own copy stops being the
  // document of record there, even though staff may still correct it.
  assert.equal(editableAt("ASSIGNED", SELLER), false, "the wallet has already been debited");
  assert.equal(editableAt("IN_PRODUCTION", SELLER), false);
});

test("a hold is judged by where it came from, not by being a hold", () => {
  // The usual hold: PENDING, waiting for artwork. Refusing edits to it would
  // refuse exactly the edit that releases it.
  assert.equal(editableAt("ON_HOLD", STAFF, "PENDING"), true);
  assert.equal(editableAt("ON_HOLD", STAFF, "ASSIGNED"), true);
  // Held out of production is still past the line.
  assert.equal(editableAt("ON_HOLD", STAFF, "IN_PRODUCTION"), false);
  assert.equal(editableAt("ON_HOLD", STAFF, "SHIPPED"), false);

  // No stored origin means PENDING — the same floor resumeTargetOf falls back
  // to, so an old row with no `resumeTo` in its configs is not locked out.
  assert.equal(editableAt("ON_HOLD", STAFF, null), true);
  assert.equal(editableAt("ON_HOLD", STAFF, undefined), true);

  // The seller's narrower window applies to holds too.
  assert.equal(editableAt("ON_HOLD", SELLER, "PENDING"), true);
  assert.equal(editableAt("ON_HOLD", SELLER, "ASSIGNED"), false);
});

test("the window sits inside the processing set, and never touches a closed order", () => {
  // BEFORE_PRODUCTION is the first half of PROCESSING. Stating it here means a
  // future status added to one and forgotten in the other fails loudly.
  for (const status of BEFORE_PRODUCTION) {
    assert.ok(PROCESSING.includes(status), `${status} should be a processing status`);
  }
  for (const status of TERMINAL) {
    assert.equal(editableAt(status, STAFF), false, `${status} is closed`);
  }
});
