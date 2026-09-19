/**
 * The workflow engine's vocabulary.
 *
 * Nothing here knows what an order is. The engine moves a token around a graph
 * and asks the host application yes/no questions through `SubjectFacts`. That
 * is the whole reason this file can live in a package with no dependencies:
 * the rules belong to the merchant, not to the code.
 */

export type StateKind = "INITIAL" | "ACTIVE" | "TERMINAL";

// Roles belong to the access model, not to the workflow engine — the engine
// only ever asks "is this actor at least X?". Re-exported so a caller working
// with transitions does not have to import from two places.
export { ROLE_RANK, atLeast, type Actor, type Role } from "../access.ts";
import { ROLE_RANK, type Role } from "../access.ts";

export interface WorkflowState {
  readonly key: string;
  readonly label: string;
  readonly kind: StateKind;
  readonly position?: number;
}

/**
 * A guard as stored: a discriminator plus whatever that guard needs. It is
 * data, so a definition round-trips through JSON, can be diffed in a pull
 * request, and can be authored in a UI without a deploy.
 */
export interface GuardSpec {
  readonly kind: string;
  readonly [param: string]: unknown;
}

export interface WorkflowTransition {
  readonly key: string;
  readonly label: string;
  readonly from: string;
  readonly to: string;
  /** Null or absent means any member of the tenant may take it. */
  readonly requiredRole?: Role | null;
  readonly guards?: readonly GuardSpec[];
}

export interface WorkflowDefinition {
  readonly key: string;
  readonly version: number;
  readonly name: string;
  readonly states: readonly WorkflowState[];
  readonly transitions: readonly WorkflowTransition[];
}


/**
 * What the host application knows about the thing being moved, reduced to
 * booleans and numbers.
 *
 * This is the seam. The engine never loads an order, so it never needs a
 * database, so it is testable in microseconds — and a merchant's rule about
 * artwork or stock is a fact name in configuration rather than a branch in
 * this package.
 */
export interface SubjectFacts {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly counts: Readonly<Record<string, number>>;
}

export const NO_FACTS: SubjectFacts = Object.freeze({
  flags: Object.freeze({}),
  counts: Object.freeze({}),
});

export type TransitionErrorCode =
  | "unknown_state"
  | "unknown_transition"
  | "wrong_source_state"
  | "terminal_state"
  | "insufficient_role"
  | "guard_failed";

export interface TransitionError {
  readonly code: TransitionErrorCode;
  readonly message: string;
  /** Present when code is "guard_failed": which guards said no, and why. */
  readonly failures?: readonly GuardFailure[];
}

export interface GuardFailure {
  readonly guard: string;
  readonly code: string;
  readonly message: string;
}

export type TransitionResult =
  | { readonly ok: true; readonly from: WorkflowState; readonly to: WorkflowState; readonly transition: WorkflowTransition }
  | { readonly ok: false; readonly error: TransitionError };
