import { test } from "node:test";
import assert from "node:assert/strict";

import { isEmailCodeShaped, isEmailShaped, normalizeEmail, validatePassword } from "./auth.ts";

test("an address has one spelling", () => {
  assert.equal(normalizeEmail("  Ada@Example.COM "), "ada@example.com");
});

test("dots and plus tags are left alone", () => {
  // Stripping them is a Gmail convention, not an email one, and doing it would
  // merge two addresses another provider considers different people.
  assert.equal(normalizeEmail("a.b+tag@example.com"), "a.b+tag@example.com");
  assert.notEqual(normalizeEmail("a.b@example.com"), normalizeEmail("ab@example.com"));
});

test("the address check is loose on purpose", () => {
  assert.equal(isEmailShaped("ada@example.com"), true);
  // sub.example.com, not example.co.uk: RFC 2606 reserves example.com/.net/.org
  // and the .example TLD, and nothing else. A real registrable domain in a test
  // fixture is exactly what the clean-room gate is there to catch — and did.
  assert.equal(isEmailShaped("a+b.c@sub.example.com"), true);
  assert.equal(isEmailShaped("unusual!#$%@example.com"), true, "valid, if strange — not ours to reject");

  assert.equal(isEmailShaped("no-at-sign"), false);
  assert.equal(isEmailShaped("no@domain"), false);
  assert.equal(isEmailShaped("two@@example.com"), false);
  assert.equal(isEmailShaped("spaces in@example.com"), false);
  assert.equal(isEmailShaped(`${"a".repeat(320)}@example.com`), false);
});

test("password rules are length and a blocklist, not composition", () => {
  assert.deepEqual(validatePassword("correct horse battery staple"), [], "a long passphrase passes");
  assert.deepEqual(
    validatePassword("Aa1!x").map((i) => i.code),
    ["too_short"],
    "short but 'complex' fails — composition is not strength",
  );
});

test("the most guessed passwords are refused", () => {
  assert.deepEqual(validatePassword("password123").map((i) => i.code), ["too_common"]);
  assert.deepEqual(validatePassword("PASSWORD123").map((i) => i.code), ["too_common"], "case does not disguise it");
});

test("a password may not contain the address it protects", () => {
  assert.deepEqual(
    validatePassword("myadalogin2026", "ada@example.com").map((i) => i.code),
    ["contains_email"],
  );
  assert.deepEqual(validatePassword("unrelated phrase here", "ada@example.com"), []);
  assert.deepEqual(
    validatePassword("bobs secret phrase", "bo@example.com"),
    [],
    "a two-character local part is too short to be a meaningful check",
  );
});

test("every problem is reported at once", () => {
  assert.deepEqual(
    validatePassword("ada", "ada@example.com").map((i) => i.code).sort(),
    ["contains_email", "too_short"],
  );
});

test("an oversized password is refused before it is hashed", () => {
  // Hashing is deliberately slow; without a ceiling that is a free denial of
  // service on the sign-in endpoint.
  assert.deepEqual(validatePassword("x".repeat(5000)).map((i) => i.code), ["too_long"]);
});

test("a code is six digits, and leading zeros count", () => {
  assert.equal(isEmailCodeShaped("000123"), true);
  assert.equal(isEmailCodeShaped(" 123456 "), true);
  assert.equal(isEmailCodeShaped("12345"), false);
  assert.equal(isEmailCodeShaped("1234567"), false);
  assert.equal(isEmailCodeShaped("12345a"), false);
});
