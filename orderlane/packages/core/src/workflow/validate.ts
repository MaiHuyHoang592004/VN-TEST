import type { WorkflowDefinition } from "./types.ts";

/**
 * A definition is data, and data arrives wrong. These checks run before a
 * definition is saved, so a merchant cannot publish a process with an
 * unreachable state and discover it a week later with work stuck in it.
 */

export interface DefinitionIssue {
  readonly code:
    | "no_initial_state"
    | "multiple_initial_states"
    | "no_terminal_state"
    | "duplicate_state_key"
    | "duplicate_transition_key"
    | "unknown_state_reference"
    | "transition_leaves_terminal"
    | "unreachable_state"
    | "dead_end_state"
    | "self_transition";
  readonly message: string;
  /** The state or transition key the issue is about, when there is one. */
  readonly at?: string;
}

export function validateDefinition(definition: WorkflowDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const stateKeys = new Set<string>();

  for (const state of definition.states) {
    if (stateKeys.has(state.key)) {
      issues.push({ code: "duplicate_state_key", message: `state "${state.key}" is declared twice`, at: state.key });
    }
    stateKeys.add(state.key);
  }

  const initial = definition.states.filter((s) => s.kind === "INITIAL");
  if (initial.length === 0) {
    issues.push({ code: "no_initial_state", message: "a definition needs exactly one INITIAL state, found none" });
  } else if (initial.length > 1) {
    issues.push({
      code: "multiple_initial_states",
      message: `a definition needs exactly one INITIAL state, found ${initial.length}: ${initial.map((s) => s.key).join(", ")}`,
    });
  }

  const terminals = new Set(definition.states.filter((s) => s.kind === "TERMINAL").map((s) => s.key));
  if (terminals.size === 0) {
    issues.push({ code: "no_terminal_state", message: "a definition needs at least one TERMINAL state, found none" });
  }

  const transitionKeys = new Set<string>();
  const outgoing = new Map<string, string[]>();

  for (const t of definition.transitions) {
    if (transitionKeys.has(t.key)) {
      issues.push({ code: "duplicate_transition_key", message: `transition "${t.key}" is declared twice`, at: t.key });
    }
    transitionKeys.add(t.key);

    if (!stateKeys.has(t.from)) {
      issues.push({ code: "unknown_state_reference", message: `"${t.key}" leaves unknown state "${t.from}"`, at: t.key });
    }
    if (!stateKeys.has(t.to)) {
      issues.push({ code: "unknown_state_reference", message: `"${t.key}" points at unknown state "${t.to}"`, at: t.key });
    }
    if (t.from === t.to) {
      issues.push({ code: "self_transition", message: `"${t.key}" leaves and enters "${t.from}"`, at: t.key });
    }
    if (terminals.has(t.from)) {
      issues.push({
        code: "transition_leaves_terminal",
        message: `"${t.key}" leaves TERMINAL state "${t.from}"; terminal means terminal`,
        at: t.key,
      });
    }

    const list = outgoing.get(t.from);
    if (list) list.push(t.to);
    else outgoing.set(t.from, [t.to]);
  }

  // Reachability, forwards from INITIAL. A state nothing can reach is either a
  // typo or a leftover from an edit, and both are worth catching before work
  // can land in it.
  const start = initial[0];
  if (start) {
    const reached = traverse(start.key, (k) => outgoing.get(k) ?? []);
    for (const state of definition.states) {
      if (!reached.has(state.key)) {
        issues.push({ code: "unreachable_state", message: `"${state.key}" cannot be reached from "${start.key}"`, at: state.key });
      }
    }
  }

  // Reachability, backwards from the terminals. This is the check that catches
  // the expensive mistake: a state that work can enter and never leave. It is
  // invisible on a diagram and obvious to a graph search.
  const incoming = new Map<string, string[]>();
  for (const t of definition.transitions) {
    const list = incoming.get(t.to);
    if (list) list.push(t.from);
    else incoming.set(t.to, [t.from]);
  }
  const canFinish = new Set<string>();
  for (const terminal of terminals) {
    for (const key of traverse(terminal, (k) => incoming.get(k) ?? [])) canFinish.add(key);
  }
  for (const state of definition.states) {
    if (state.kind !== "TERMINAL" && !canFinish.has(state.key)) {
      issues.push({ code: "dead_end_state", message: `"${state.key}" has no path to any TERMINAL state`, at: state.key });
    }
  }

  return issues;
}

function traverse(from: string, next: (key: string) => readonly string[]): Set<string> {
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length > 0) {
    const key = stack.pop()!;
    for (const neighbour of next(key)) {
      if (!seen.has(neighbour)) {
        seen.add(neighbour);
        stack.push(neighbour);
      }
    }
  }
  return seen;
}
