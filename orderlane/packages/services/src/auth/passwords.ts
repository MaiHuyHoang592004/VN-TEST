import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with scrypt.
 *
 * scrypt rather than bcrypt because it is in node:crypto — no native module,
 * no dependency, no build step — and it is memory-hard, which bcrypt is not.
 * Memory hardness is what makes a GPU or ASIC farm a poor investment against
 * these hashes. Argon2id would be the current first choice, but it needs a
 * native dependency; the parameters below put scrypt in the same range, and
 * the encoded format carries them so raising the cost later does not invalidate
 * existing hashes.
 *
 * N=2^15 with r=8 is about 32 MB per hash and ~100ms on a modern core. That is
 * a deliberate trade: it is slow enough to matter to an attacker and slow
 * enough to be a denial-of-service lever, which is why the length ceiling in
 * @orderlane/core and the sign-in throttle both exist.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** `scrypt$N$r$p$salt$hash`, all base64url. Self-describing, so parameters can change. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

/**
 * Verify, in constant time with respect to the hash.
 *
 * A malformed or missing hash returns false rather than throwing: the caller's
 * correct behaviour is identical either way, and an exception here would be a
 * way to tell "no such user" apart from "wrong password".
 */
export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  if (!encoded) return false;

  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64url");
    expected = Buffer.from(parts[5]!, "base64url");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  try {
    const derived = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: PARAMS.maxmem,
    });
    return timingSafeEqual(derived, expected);
  } catch {
    // Parameters outside what this process will spend memory on. Treated as a
    // failed verification, not an error to leak upstream.
    return false;
  }
}

/**
 * A hash of a password nobody has.
 *
 * Verified against when an email does not exist, so that "no such account" and
 * "wrong password" take the same time. Without it, sign-in is an oracle for
 * which addresses are registered — measurable over a few hundred requests.
 */
let decoyPromise: Promise<string> | null = null;
export function decoyHash(): Promise<string> {
  decoyPromise ??= hashPassword(randomBytes(32).toString("base64url"));
  return decoyPromise;
}
