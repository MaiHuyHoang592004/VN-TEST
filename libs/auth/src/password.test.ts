import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";
import { verifyPassword } from "./password";

const scrypt = promisify(scryptCb) as (
  p: string | Buffer,
  s: string | Buffer,
  k: number,
  o: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// Replicates the legacy NestJS backend's hashPassword EXACTLY
// (.archive/oldproject/…/auth/auth.service.ts) — same params + serialization,
// so a pass here means real migrated hashes verify.
async function legacyScryptHash(password: string): Promise<string> {
  const salt = randomBytes(32);
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const b64 = (b: Buffer) => b.toString("base64").split("=")[0];
  return `$scrypt$N=32768,r=8,p=1,maxmem=67108864$${b64(salt)}$${b64(hash)}`;
}

test("legacy scrypt hash verifies with the correct password", async () => {
  const hash = await legacyScryptHash("correct horse battery staple");
  assert.ok(hash.startsWith("$scrypt$N=32768,r=8,p=1,maxmem=67108864$"));
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
});

test("legacy scrypt hash rejects the wrong password", async () => {
  const hash = await legacyScryptHash("correct horse battery staple");
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("bcrypt hash still verifies (new-scheme accounts)", async () => {
  const hash = await bcrypt.hash("asdfg@123", 10);
  assert.equal(await verifyPassword("asdfg@123", hash), true);
  assert.equal(await verifyPassword("nope", hash), false);
});

test("garbage / malformed hashes fail closed, never throw", async () => {
  assert.equal(await verifyPassword("x", "$scrypt$bogus"), false);
  assert.equal(await verifyPassword("x", ""), false);
});
