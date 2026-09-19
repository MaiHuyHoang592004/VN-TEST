import { BUILT_IN_GUARDS, evaluateGuards, type GuardRegistry } from "./guards.ts";
import {
  NO_FACTS,
  ROLE_RANK,
  type Actor,
  type SubjectFacts,
  type TransitionResult,
  type WorkflowDefinition,
  type WorkflowState,
  type WorkflowTransition,
} from "./types.ts";

export interface EngineOptions {
  readonly facts?: SubjectFacts;
  readonly registry?: GuardRegistry;
}

/**
 * Index a definition once, then ask it questions. Building the maps per call
 * would be fine at this size; doing it once is free and keeps the hot path
 * ("what can this operator do with these 200 rows?") linear rather than
 * quadratic.
 */
export class Workflow {
  readonly definition: WorkflowDefinition;
  readonly #states: Map<string, WorkflowState>;
  readonly #transitions: Map<string, WorkflowTransition>;
  readonly #outgoing: Map<string, WorkflowTransition[]>;

  constructor(definition: WorkflowDefinition) {
    this.definition = definition;
    this.#states = new Map(definition.states.map((s) => [s.key, s]));
    this.#transitions = new Map(definition.transitions.map((t) => [t.key, t]));
    this.#outgoing = new Map();
    for (const t of definition.transitions) {
      const list = this.#outgoing.get(t.from);
      if (list) list.push(t);
      else this.#outgoing.set(t.from, [t]);
    }
  }

  state(key: string): WorkflowState | undefined {
    return this.#states.get(key);
  }

  /** Every transition leaving a state, legal or not. For rendering a diagram. */
  outgoing(stateKey: string): readonly WorkflowTransition[] {
    return this.#outgoing.get(stateKey) ?? [];
  }

  /**
   * The transitions this actor may actually take right now. The UI renders
   * exactly this list, so a button that is visible is a button that works —
   * the permission check and the affordance come from one computation instead
   * of two that drift.
   */
  available(
    currentStateKey: string,
    actor: Actor,
    options: EngineOptions = {},
  ): readonly WorkflowTransition[] {
    return this.outgoing(currentStateKey).filter(
      (t) => this.attempt(currentStateKey, t.key, actor, options).ok,
    );
  }

  /**
   * Decide whether a move is legal. Pure: it returns a decision and changes
   * nothing. Persisting the result — the new state, the log entry, the
   * optimistic-lock bump — is the caller's job, in one database transaction.
   */
  attempt(
    currentStateKey: string,
    transitionKey: string,
    actor: Actor,
    options: EngineOptions = {},
  ): TransitionResult {
    const from = this.#states.get(currentStateKey);
    if (!from) {
      return err("unknown_state", `no state "${currentStateKey}" in ${this.definition.key}`);
    }
    if (from.kind === "TERMINAL") {
      return err("terminal_state", `"${from.key}" is terminal; nothing leaves it`);
    }

    const transition = this.#transitions.get(transitionKey);
    if (!transition) {
      return err("unknown_transition", `no transition "${transitionKey}" in ${this.definition.key}`);
    }
    if (transition.from !== from.key) {
      return err(
        "wrong_source_state",
        `"${transition.key}" leaves "${transition.from}", but the subject is in "${from.key}"`,
      );
    }

    const to = this.#states.get(transition.to);
    if (!to) {
      return err("unknown_state", `"${transition.key}" points at missing state "${transition.to}"`);
    }

    // SYSTEM actors (carrier webhooks, scheduled jobs) still carry a role, so
    // an automated move cannot quietly do what no human is allowed to do.
    if (transition.requiredRole && ROLE_RANK[actor.role] < ROLE_RANK[transition.requiredRole]) {
      return err(
        "insufficient_role",
        `"${transition.key}" needs ${transition.requiredRole}, actor is ${actor.role}`,
      );
    }

    const failures = evaluateGuards(
      transition.guards ?? [],
      options.facts ?? NO_FACTS,
      options.registry ?? BUILT_IN_GUARDS,
    );
    if (failures.length > 0) {
      return {
        ok: false,
        error: {
          code: "guard_failed",
          message: `"${transition.key}" is blocked by ${failures.length} guard(s)`,
          failures,
        },
      };
    }

    return { ok: true, from, to, transition };
  }
}

function err(code: TransitionResultErrorCode, message: string): TransitionResult {
  return { ok: false, error: { code, message } };
}

type TransitionResultErrorCode = Exclude<
  Extract<TransitionResult, { ok: false }>["error"]["code"],
  "guard_failed"
>;
