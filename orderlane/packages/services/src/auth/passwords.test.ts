import { test } from "node:test";
import assert from "node:assert/strict";

import { decoyHash, hashPassword, verifyPassword } from "./passwords.ts";

test("a password verifies against its own hash and nothing else", async () => {
  const encoded = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", encoded), true);
  assert.equal(await verifyPassword("Correct horse battery staple", encoded), false);
  assert.equal(await verifyPassword("", encoded), false);
});

test("two hashes of the same password differ", async () => {
  const a = await hashPassword("same password here");
  const b = await hashPassword("same password here");
  assert.notEqual(a, b, "a random salt per hash: identical passwords must not look identical");
  assert.equal(await verifyPassword("same password here", a), true);
  assert.equal(await verifyPassword("same password here", b), true);
});

test("the encoded form carries its own parameters", async () => {
  const encoded = await hashPassword("a long enough password");
  const [scheme, N, r, p] = encoded.split("$");
  assert.equal(scheme, "scrypt");
  assert.equal(Number(N), 32768);
  assert.equal(Number(r), 8);
  assert.equal(Number(p), 1);
  assert.equal(encoded.split("$").length, 6);
});

test("unicode spellings of the same password agree", async () => {
  // "é" composed and decomposed are the same character to the person typing it.
  const encoded = await hashPassword("passéphrase long");
  assert.equal(await verifyPassword("passéphrase long", encoded), true);
});

test("a missing or malformed hash is a failed verification, not an exception", async () => {
  // This matters: throwing here would tell an attacker apart "no such user"
  // from "wrong password" by the shape of the response.
  assert.equal(await verifyPassword("anything", null), false);
  assert.equal(await verifyPassword("anything", ""), false);
  assert.equal(await verifyPassword("anything", "not-a-hash"), false);
  assert.equal(await verifyPassword("anything", "scrypt$1$2$3$4"), false);
  assert.equal(await verifyPassword("anything", "bcrypt$32768$8$1$c2FsdA$aGFzaA"), false);
  assert.equal(await verifyPassword("anything", "scrypt$x$8$1$c2FsdA$aGFzaA"), false);
  assert.equal(await verifyPassword("anything", "scrypt$32768$8$1$c2FsdA$"), false);
});

test("a decoy hash exists so a missing account costs the same as a wrong password", async () => {
  const decoy = await decoyHash();
  assert.ok(decoy.startsWith("scrypt$"));
  assert.equal(await verifyPassword("anything at all", decoy), false);
  assert.equal(await decoyHash(), decoy, "computed once, reused — it is a cost, not a secret");
});
