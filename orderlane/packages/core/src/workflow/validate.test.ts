import { test } from "node:test";
import assert from "node:assert/strict";

import { PRESETS } from "./presets.ts";
import { validateDefinition } from "./validate.ts";
import type { WorkflowDefinition } from "./types.ts";

const codes = (d: WorkflowDefinition) => validateDefinition(d).map((i) => i.code).sort();

test("both shipped presets are valid", () => {
  for (const preset of PRESETS) {
    assert.deepEqual(validateDefinition(preset), [], `${preset.key} should have no issues`);
  }
});

test("a state nothing can reach is reported", () => {
  const issues = validateDefinition({
    key: "t",
    version: 1,
    name: "t",
    states: [
      { key: "a", label: "A", kind: "INITIAL" },
      { key: "b", label: "B", kind: "TERMINAL" },
      { key: "orphan", label: "Orphan", kind: "ACTIVE" },
    ],
    transitions: [{ key: "go", label: "Go", from: "a", to: "b" }],
  });
  assert.ok(issues.some((i) => i.code === "unreachable_state" && i.at === "orphan"));
});

test("a state work can enter but never leave is reported", () => {
  const issues = validateDefinition({
    key: "t",
    version: 1,
    name: "t",
    states: [
      { key: "a", label: "A", kind: "INITIAL" },
      { key: "trap", label: "Trap", kind: "ACTIVE" },
      { key: "done", label: "Done", kind: "TERMINAL" },
    ],
    transitions: [
      { key: "go", label: "Go", from: "a", to: "done" },
      { key: "fall_in", label: "Fall in", from: "a", to: "trap" },
    ],
  });
  assert.ok(
    issues.some((i) => i.code === "dead_end_state" && i.at === "trap"),
    "trap is reachable and has no path to a terminal state",
  );
});

test("exactly one INITIAL state, at least one TERMINAL", () => {
  assert.ok(
    codes({
      key: "t",
      version: 1,
      name: "t",
      states: [
        { key: "a", label: "A", kind: "INITIAL" },
        { key: "b", label: "B", kind: "INITIAL" },
        { key: "c", label: "C", kind: "TERMINAL" },
      ],
      transitions: [
        { key: "ac", label: "", from: "a", to: "c" },
        { key: "bc", label: "", from: "b", to: "c" },
      ],
    }).includes("multiple_initial_states"),
  );

  assert.ok(
    codes({
      key: "t",
      version: 1,
      name: "t",
      states: [{ key: "a", label: "A", kind: "ACTIVE" }],
      transitions: [],
    }).includes("no_initial_state"),
  );

  assert.ok(
    codes({
      key: "t",
      version: 1,
      name: "t",
      states: [{ key: "a", label: "A", kind: "INITIAL" }],
      transitions: [],
    }).includes("no_terminal_state"),
  );
});

test("a transition out of a terminal state, or into a missing one, is reported", () => {
  const issues = validateDefinition({
    key: "t",
    version: 1,
    name: "t",
    states: [
      { key: "a", label: "A", kind: "INITIAL" },
      { key: "z", label: "Z", kind: "TERMINAL" },
    ],
    transitions: [
      { key: "az", label: "", from: "a", to: "z" },
      { key: "escape", label: "", from: "z", to: "a" },
      { key: "nowhere", label: "", from: "a", to: "ghost" },
    ],
  });
  const found = issues.map((i) => i.code);
  assert.ok(found.includes("transition_leaves_terminal"));
  assert.ok(found.includes("unknown_state_reference"));
});
