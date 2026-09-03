/**
 * Station refusals, as codes.
 *
 * Same discipline as InvalidTransitionError: the station localises off `code`,
 * the API returns it verbatim, and nobody parses English to decide what
 * happened. `detail` carries the rows that caused it, so "not ready" can name
 * which pieces of the parcel are not.
 */
export type StationErrorCode =
  | "no-available-basket"
  | "check-failed"
  | "not-ready"
  | "not-in-production"
  | "amount-exceeds-remaining"
  | "group-not-found";

export class StationError extends Error {
  readonly code: StationErrorCode;
  readonly detail?: unknown;
  // Fields assigned explicitly, not via parameter properties: node --test
  // strips types rather than compiling them (modules/README.md).
  constructor(code: StationErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "StationError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * More than this many orders behind one scan and a human confirms first. A
 * mistyped search that silently moved 400 orders is the accident legacy added
 * this gate for.
 */
export const CONFIRM_THRESHOLD = 20;
