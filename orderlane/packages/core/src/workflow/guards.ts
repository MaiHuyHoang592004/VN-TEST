import type { GuardFailure, GuardSpec, SubjectFacts } from "./types.ts";

/**
 * A guard answers one question about the subject. It receives its own stored
 * parameters and the facts the host supplied, and nothing else — no database
 * handle, no clock, no network. Guards are therefore total functions, which is
 * what makes "why can't I move this order?" answerable without reproducing the
 * request.
 */
export type GuardFn = (spec: GuardSpec, facts: SubjectFacts) => GuardOutcome;

export type GuardOutcome = { ok: true } | { ok: false; code: string; message: string };

export type GuardRegistry = Readonly<Record<string, GuardFn>>;

/**
 * The built-ins are deliberately domain-free. "Every line has artwork" is not
 * a guard here; it is `{"kind":"flag_is_true","flag":"all_lines_have_artwork"}`
 * plus a host that knows how to compute that flag. Keeping the vocabulary
 * generic is what stops one merchant's process from becoming everyone's.
 */
export const BUILT_IN_GUARDS: GuardRegistry = Object.freeze({
  flag_is_true(spec, facts) {
    const flag = String(spec["flag"] ?? "");
    if (facts.flags[flag] === true) return { ok: true };
    return {
      ok: false,
      code: "flag_not_set",
      message: `expected "${flag}" to be true`,
    };
  },

  flag_is_false(spec, facts) {
    const flag = String(spec["flag"] ?? "");
    if (facts.flags[flag] === false) return { ok: true };
    return {
      ok: false,
      code: "flag_set",
      message: `expected "${flag}" to be false`,
    };
  },

  count_at_least(spec, facts) {
    const name = String(spec["count"] ?? "");
    const min = Number(spec["min"] ?? 0);
    const actual = facts.counts[name] ?? 0;
    if (actual >= min) return { ok: true };
    return {
      ok: false,
      code: "count_below_minimum",
      message: `expected "${name}" to be at least ${min}, got ${actual}`,
    };
  },

  count_is_zero(spec, facts) {
    const name = String(spec["count"] ?? "");
    const actual = facts.counts[name] ?? 0;
    if (actual === 0) return { ok: true };
    return {
      ok: false,
      code: "count_not_zero",
      message: `expected "${name}" to be 0, got ${actual}`,
    };
  },
});

/**
 * Runs every guard rather than stopping at the first failure: an operator who
 * is two steps away from being able to proceed should be told both steps at
 * once, not made to discover them one save at a time.
 */
export function evaluateGuards(
  specs: readonly GuardSpec[],
  facts: SubjectFacts,
  registry: GuardRegistry,
): GuardFailure[] {
  const failures: GuardFailure[] = [];
  for (const spec of specs) {
    const fn = registry[spec.kind];
    if (!fn) {
      // An unknown guard denies the transition. The opposite default would
      // mean a typo in configuration silently removes a safety check.
      failures.push({
        guard: spec.kind,
        code: "unknown_guard",
        message: `no guard registered for "${spec.kind}"`,
      });
      continue;
    }
    const outcome = fn(spec, facts);
    if (!outcome.ok) {
      failures.push({ guard: spec.kind, code: outcome.code, message: outcome.message });
    }
  }
  return failures;
}
