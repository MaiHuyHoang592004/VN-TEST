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
import type { FulfillmentStatus } from "@opcreative/db";

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
