/**
 * The order lifecycle, as DATA.
 *
 * A map rather than a switch on purpose: doc 05's scan stations, the bulk
 * status menu and the public API all need to know which moves are legal, and
 * every one of them reads this table instead of restating the rules. A menu
 * built from the map cannot offer a transition the service will reject.
 *
 * Legacy had no such notion — any status could be written over any other from
 * any screen, so an order could go from DELIVERED back to PENDING and nobody
 * would know it had.
 */
import type { FulfillmentStatus } from "@gwprint/db";

/** Terminal: nothing moves out of these. */
export const TERMINAL: readonly FulfillmentStatus[] = [
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

/**
 * The forward path. ON_HOLD is not here — it is reachable from anywhere
 * non-terminal and returns to wherever it came from, which is why the service
 * remembers the previous status rather than guessing one.
 */
const FORWARD: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  PENDING: ["ASSIGNED"],
  ASSIGNED: ["IN_PRODUCTION"],
  IN_PRODUCTION: ["FULFILLED"],
  FULFILLED: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
  ON_HOLD: [],
};

/** Any non-terminal order can be put on hold or cancelled outright. */
const ESCAPES: FulfillmentStatus[] = ["ON_HOLD", "CANCELLED"];

/**
 * Every status `from` may legally become.
 *
 * ON_HOLD resolves back to `resumeTo` (the status it was held from) or forward
 * from there — a held order does not lose its place in the queue.
 */
export function allowedTransitions(
  from: FulfillmentStatus,
  resumeTo?: FulfillmentStatus | null,
): FulfillmentStatus[] {
  if (TERMINAL.includes(from)) return [];
  if (from === "ON_HOLD") {
    const back = resumeTo && !TERMINAL.includes(resumeTo) ? resumeTo : "PENDING";
    return [...new Set([back, ...FORWARD[back], "CANCELLED" as FulfillmentStatus])];
  }
  return [...new Set([...FORWARD[from], ...ESCAPES])];
}

export function canTransition(
  from: FulfillmentStatus,
  to: FulfillmentStatus,
  resumeTo?: FulfillmentStatus | null,
): boolean {
  return allowedTransitions(from, resumeTo).includes(to);
}

/**
 * A stable, machine-readable refusal. The UI localises off the code; the API
 * returns it verbatim, so an integration can branch on it without parsing
 * English.
 */
export class InvalidTransitionError extends Error {
  readonly code = "invalid-transition" as const;
  readonly from: FulfillmentStatus;
  readonly to: FulfillmentStatus;
  // Fields assigned explicitly, not via TypeScript parameter properties:
  // node --test strips types rather than compiling them, and `constructor(
  // readonly from: T)` is syntax it refuses. Services must stay runnable
  // under the plain test runner (modules/README.md).
  constructor(from: FulfillmentStatus, to: FulfillmentStatus) {
    super(`Cannot move an order from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** Statuses that mean the order is still being worked — the "Processing" tab. */
export const PROCESSING: readonly FulfillmentStatus[] = [
  "PENDING",
  "ASSIGNED",
  "IN_PRODUCTION",
];

/**
 * Statuses at which nobody has started MAKING the order yet.
 *
 * The edit window is a property of the lifecycle, so it lives here beside
 * PROCESSING rather than as an `if` inside whichever service happens to ask.
 * Two surfaces ask — the dashboard's updateOrder and the public API's
 * patchOrder — and the point of a table is that they cannot answer differently.
 *
 * IN_PRODUCTION is the line: past it a person has cut, printed or engraved
 * something against what the order said, and editing the order afterwards
 * describes a piece that does not exist.
 */
export const BEFORE_PRODUCTION: readonly FulfillmentStatus[] = ["PENDING", "ASSIGNED"];

/**
 * May this order still be edited, by an actor with this reach?
 *
 * `wide` is orders.update (staff): the whole pre-production window. Without it
 * the actor holds orders.update.own, and a seller's window closes one step
 * earlier — at ASSIGNED the wallet has already been debited and the job is in
 * a queue somebody is working from, so the seller's own copy stops being the
 * document of record.
 *
 * ON_HOLD is asked about its ORIGIN rather than lumped in either way. A hold
 * placed on a PENDING order is still a pending order that is waiting for an
 * answer — usually the artwork — and refusing edits to it would refuse exactly
 * the edit that releases it. A hold placed on an IN_PRODUCTION order is not.
 * `resumeTo` is what applyStatusChange stored on the way in; PENDING is the
 * floor it falls back to, matching resumeTargetOf's own default.
 */
export function editableAt(
  status: FulfillmentStatus,
  wide: boolean,
  resumeTo?: FulfillmentStatus | null,
): boolean {
  const window: readonly FulfillmentStatus[] = wide ? BEFORE_PRODUCTION : ["PENDING"];
  if (status === "ON_HOLD") return window.includes(resumeTo ?? "PENDING");
  return window.includes(status);
}
