import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptToken, decryptToken } from "./token-crypto.js";

const key = Buffer.alloc(32, 9).toString("base64");

test("round-trips a token through encrypt/decrypt", () => {
  const plaintext = "shpat_" + "a".repeat(32);
  const enc = encryptToken(plaintext, key);
  assert.ok(Buffer.isBuffer(enc));
  assert.equal(decryptToken(enc, key), plaintext);
});

test("two encryptions of the same plaintext produce different ciphertext (random IV)", () => {
  const plaintext = "same-secret";
  const a = encryptToken(plaintext, key);
  const b = encryptToken(plaintext, key);
  assert.notDeepEqual(a, b);
  assert.equal(decryptToken(a, key), plaintext);
  assert.equal(decryptToken(b, key), plaintext);
});

test("tampered ciphertext fails to decrypt instead of returning garbage", () => {
  const enc = encryptToken("secret", key);
  enc[enc.length - 1] ^= 0xff;
  assert.throws(() => decryptToken(enc, key));
});

test("decrypting with the wrong key fails", () => {
  const enc = encryptToken("secret", key);
  const otherKey = Buffer.alloc(32, 1).toString("base64");
  assert.throws(() => decryptToken(enc, otherKey));
});

test("rejects an unrecognized format version instead of misreading the bytes", () => {
  const enc = encryptToken("secret", key);
  enc[0] = 99;
  assert.throws(() => decryptToken(enc, key), /format version/);
});
