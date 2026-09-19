import { test } from "node:test";
import assert from "node:assert/strict";

import { ROLES, atLeast, isRole } from "./access.ts";

test("a requirement is a minimum, not an equality", () => {
  assert.equal(atLeast("OWNER", "OPERATOR"), true);
  assert.equal(atLeast("OPERATOR", "OPERATOR"), true);
  assert.equal(atLeast("VIEWER", "OPERATOR"), false);
  assert.equal(atLeast("OWNER", "VIEWER"), true);
});

test("the ordering is total and has no gaps", () => {
  for (const role of ROLES) assert.equal(atLeast(role, role), true);
  for (let i = 0; i < ROLES.length; i++) {
    for (let j = 0; j < ROLES.length; j++) {
      assert.equal(atLeast(ROLES[i]!, ROLES[j]!), i >= j);
    }
  }
});

test("an unknown role is not a role", () => {
  assert.equal(isRole("ADMIN"), false, "the old six-role vocabulary is not accepted by accident");
  assert.equal(isRole("owner"), false, "case matters; a lowercase value is a bug upstream");
  assert.equal(isRole("OWNER"), true);
  assert.equal(isRole(undefined), false);
});
