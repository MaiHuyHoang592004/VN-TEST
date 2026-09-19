import { test } from "node:test";
import assert from "node:assert/strict";

import { atLeast, type Role } from "../access.ts";
import { Workflow } from "./engine.ts";
import { PRESETS } from "./presets.ts";
import type { Actor } from "./types.ts";

/**
 * The shipped presets are installed into every tenant by `createTenant`, so
 * they are not sample data — they are the default configuration of the
 * product, and their `requiredRole` values are a security boundary.
 */

const VIEWER: Actor = { kind: "USER", id: "v", role: "VIEWER" };

test("every shipped transition names a requiredRole", () => {
  // `requiredRole: null` means "any member", and the lowest tier is read-only.
  // Leaving it off a state-changing edge — which is easy to do, and reads as
  // "this one isn't a staff action" — hands write access to a VIEWER.
  const open: string[] = [];
  for (const preset of PRESETS) {
    for (const transition of preset.transitions) {
      if (!transition.requiredRole) open.push(`${preset.key}:${transition.key}`);
    }
  }
  assert.deepEqual(open, [], "these transitions would be available to a read-only member");
});

test("a viewer can take nothing, from any state, in any preset", () => {
  // The earlier version of this assertion was made at one state only, and the
  // state it picked happened to be the one where both outgoing edges carried a
  // role. It passed while six other transitions were wide open.
  for (const preset of PRESETS) {
    const workflow = new Workflow(preset);
    for (const state of preset.states) {
      const available = workflow.available(state.key, VIEWER, {
        facts: { flags: { has_shipping_label: true }, counts: { lines_missing_stock: 0, lines_missing_artwork: 0 } },
      });
      assert.deepEqual(
        available.map((t) => t.key),
        [],
        `a viewer should have nothing to do in ${preset.key}/${state.key}`,
      );
    }
  }
});

test("no transition requires less than OPERATOR", () => {
  const floor: Role = "OPERATOR";
  for (const preset of PRESETS) {
    for (const transition of preset.transitions) {
      assert.ok(
        transition.requiredRole && atLeast(transition.requiredRole, floor),
        `${preset.key}:${transition.key} requires ${transition.requiredRole}, below the ${floor} floor`,
      );
    }
  }
});

test("an operator is never stuck: every non-terminal state has a move for them", () => {
  // The property that matters after raising the floor — that it locked out the
  // read-only tier without locking out the tier that does the work. Stated as
  // "no dead end for an OPERATOR" rather than by walking a path, because these
  // graphs contain cycles and a walk would have to pick its way around them.
  const operator: Actor = { kind: "USER", id: "o", role: "OPERATOR" };
  const facts = {
    flags: { has_shipping_label: true },
    counts: { lines_missing_stock: 0, lines_missing_artwork: 0 },
  };

  for (const preset of PRESETS) {
    const workflow = new Workflow(preset);
    for (const state of preset.states) {
      if (state.kind === "TERMINAL") continue;
      const available = workflow.available(state.key, operator, { facts });
      assert.ok(available.length > 0, `an operator has nothing to do in ${preset.key}/${state.key}`);
    }
  }
});

test("the standard-retail happy path is still walkable by an operator", () => {
  const operator: Actor = { kind: "USER", id: "o", role: "OPERATOR" };
  const facts = {
    flags: { has_shipping_label: true },
    counts: { lines_missing_stock: 0, lines_missing_artwork: 0 },
  };
  const workflow = new Workflow(PRESETS[0]!);

  let state = "received";
  for (const key of ["start_picking", "mark_packed", "dispatch", "confirm_delivery"]) {
    const result = workflow.attempt(state, key, operator, { facts });
    assert.equal(result.ok, true, `${key} from ${state} should be legal for an operator`);
    if (!result.ok) return;
    state = result.to.key;
  }
  assert.equal(state, "delivered");
  assert.equal(workflow.state(state)?.kind, "TERMINAL");
});
