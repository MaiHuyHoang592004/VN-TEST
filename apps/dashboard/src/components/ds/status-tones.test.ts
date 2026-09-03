import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { STATUS_TONES, toneFor, type StatusTone } from "./status-tones.ts";

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

test("covers every FulfillmentStatus and TicketStatus the DB can emit", () => {
  // The DS map came from a different backend's vocabulary, so the app's own
  // Prisma enums are the real contract. Every value here must render a
  // deliberate tone — a status that silently falls to neutral is a bug the
  // reader sees as "nothing happened".
  assert.equal(toneFor("PENDING"), "pending");
  assert.equal(toneFor("IN_PRODUCTION"), "progress");
  assert.equal(toneFor("FULFILLED"), "success");
  assert.equal(toneFor("SHIPPED"), "info");
  assert.equal(toneFor("DELIVERED"), "success");
  assert.equal(toneFor("ON_HOLD"), "attention");
  // Tense bridges: the DS spells these "Cancel" and "Refund".
  assert.equal(toneFor("CANCELLED"), "critical");
  assert.equal(toneFor("REFUNDED"), "info");
  // Distinct tones, because the schema keeps the two states distinct.
  assert.notEqual(toneFor("REFUNDED"), toneFor("CANCELLED"));

  assert.equal(toneFor("OPEN"), "attention");
  assert.equal(toneFor("IN_PROGRESS"), "progress");
  assert.equal(toneFor("RESOLVED"), "success");
  assert.equal(toneFor("CLOSED"), "success");
});

test("ASSIGNED is deliberately unmapped, not forgotten", () => {
  // The DS has no concept for "assigned to a warehouse, not yet in
  // production". Guessing a tone would be inventing vocabulary, so it takes
  // the neutral default. This test exists so that a future change to neutral
  // is a decision rather than an accident.
  assert.equal(toneFor("ASSIGNED"), "neutral");
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

// ─────────────────────────────────────────────────────────────────────────────
// Schema-driven coverage gate.
//
// toneFor() is the app's ONLY authority for status colour, so an enum value
// that nobody mapped does not render "no opinion" — it renders a neutral pill
// indistinguishable from a deliberate one. This block reads the Prisma schema
// itself (never a hand-typed copy of it) and requires that every value of
// every `*Status` enum be pinned here by an explicit assertion. Adding a value
// to the schema, or adding a whole new `*Status` enum, fails this test until
// somebody decides its tone and writes the reason in status-tones.ts.
//
// EXPECTED_TONES is the audit surface: `neutral` entries are deliberate
// abstentions with a reason recorded next to the value in status-tones.ts, not
// gaps.
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_PATH = path.resolve(
  fileURLToPath(import.meta.url),
  "../../../../../../libs/db/prisma/schema/enums/enums.prisma",
);

/** Every `enum <Name>Status { ... }` in the schema, with its values. */
function readStatusEnumsFromSchema(): Map<string, string[]> {
  const source = readFileSync(SCHEMA_PATH, "utf8");
  const found = new Map<string, string[]>();
  for (const match of source.matchAll(/enum\s+(\w*Status)\s*\{([^}]*)\}/g)) {
    const values = match[2]
      .split(/\r?\n/)
      // /// doc comments and // notes are not values.
      .map((line) => line.replace(/\/\/.*$/, "").trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
    found.set(match[1], values);
  }
  return found;
}

const EXPECTED_TONES: Record<string, Record<string, StatusTone>> = {
  // ACTIVE restates the DS's own `Active`. INACTIVE/BANNED have no DS twin:
  // BANNED is inferred `critical` (an operator must not read a barred account
  // as ordinary), INACTIVE is a deliberate neutral (benign resting state).
  UserStatus: { ACTIVE: "success", INACTIVE: "neutral", BANNED: "critical" },
  // PENDING restates the DS's `Pending`. The other three are deliberate
  // neutrals: an invite that was accepted, revoked or expired asks nothing of
  // the reader, and the DS models no invitation lifecycle.
  InviteStatus: {
    PENDING: "pending",
    ACCEPTED: "neutral",
    REVOKED: "neutral",
    EXPIRED: "neutral",
  },
  // ACTIVE restates `Active`; DRAFT/INACTIVE/ARCHIVED are deliberate neutrals.
  ProductStatus: {
    DRAFT: "neutral",
    ACTIVE: "success",
    INACTIVE: "neutral",
    ARCHIVED: "neutral",
  },
  FulfillmentStatus: {
    PENDING: "pending",
    // Deliberately neutral — see the ASSIGNED note in status-tones.ts.
    ASSIGNED: "neutral",
    IN_PRODUCTION: "progress",
    FULFILLED: "success",
    SHIPPED: "info",
    DELIVERED: "success",
    CANCELLED: "critical",
    ON_HOLD: "attention",
    REFUNDED: "info",
  },
  TicketStatus: {
    OPEN: "attention",
    IN_PROGRESS: "progress",
    RESOLVED: "success",
    CLOSED: "success",
  },
  // COMPLETED restates `Completed`; CANCELLED reaches `critical` through the
  // shared CANCELLED key (see the report). FAILED is inferred.
  TransactionStatus: {
    PENDING: "pending",
    COMPLETED: "success",
    FAILED: "critical",
    CANCELLED: "critical",
  },
  WarehouseStatus: { ACTIVE: "success", INACTIVE: "neutral" },
  // BROKEN is inferred `critical`; the other three are ordinary occupancy.
  BasketPositionStatus: {
    AVAILABLE: "neutral",
    RESERVED: "neutral",
    OCCUPIED: "neutral",
    BROKEN: "critical",
  },
  // COMPLETE restates `Completed`; REJECTED is inferred; PARTIAL is a
  // deliberate neutral (in flight, but the DS's `progress` is production-only).
  ReceiptStatus: {
    PENDING: "pending",
    PARTIAL: "neutral",
    COMPLETE: "success",
    REJECTED: "critical",
  },
  ReceiptShipmentStatus: {
    PENDING: "pending",
    PARTIAL_RECEIVED: "neutral",
    RECEIVED: "neutral",
    REJECTED: "critical",
  },
  // RETURNED restates the DS's `Return`; the rest is the ordinary reservation
  // path and asks nothing of the reader.
  ReservationStatus: {
    RESERVED: "neutral",
    CONSUMED: "neutral",
    RELEASED: "neutral",
    RETURNED: "attention",
  },
  BomStatus: { DRAFT: "neutral", ACTIVE: "success", INACTIVE: "neutral" },
};

test("the schema's *Status enums are exactly the ones pinned here", () => {
  // A NEW status enum in the schema must not slip in unnoticed: every value in
  // it would render neutral by accident.
  const fromSchema = [...readStatusEnumsFromSchema().keys()].sort();
  assert.deepEqual(fromSchema, Object.keys(EXPECTED_TONES).sort());
});

test("every value of every *Status enum has an explicit, deliberate tone", () => {
  const fromSchema = readStatusEnumsFromSchema();
  assert.equal(fromSchema.size > 0, true, "schema parse produced no enums");

  for (const [enumName, values] of fromSchema) {
    const expected = EXPECTED_TONES[enumName];
    assert.ok(expected, `${enumName} is not pinned in EXPECTED_TONES`);
    // Both directions: a value added to the schema is unpinned, and a value
    // removed from the schema leaves a stale pin behind.
    assert.deepEqual(
      [...values].sort(),
      Object.keys(expected).sort(),
      `${enumName}: schema values and pinned values differ`,
    );
    for (const value of values) {
      assert.equal(
        toneFor(value),
        expected[value],
        `${enumName}.${value} rendered ${toneFor(value)}, expected ${expected[value]}`,
      );
    }
  }
});

test("the statuses a reader must not miss are never neutral", () => {
  // The reason this whole file exists: a banned user, a failed transaction, a
  // rejected receipt and a broken basket position must not render the same
  // pill as "Processing". These are INFERRED tones awaiting DS ratification —
  // if the DS rules otherwise, change them here and in status-tones.ts, but
  // never let them fall back to neutral silently.
  for (const status of ["BANNED", "FAILED", "REJECTED", "BROKEN"]) {
    assert.equal(toneFor(status), "critical", `${status} must be critical`);
  }
});

test("the tense bridges restate the DS rather than inventing a tone", () => {
  // Each of these has a DS entry one suffix away; normalise() does not stem,
  // so without the bridge they would fall to neutral.
  assert.equal(toneFor("RETURNED"), toneFor("Return")); // DS: Return
  assert.equal(toneFor("COMPLETE"), toneFor("Completed")); // DS: Completed
  assert.equal(toneFor("CANCELLED"), toneFor("Cancel")); // DS: Cancel
  assert.equal(toneFor("REFUNDED"), toneFor("Refund")); // DS: Refund
});
