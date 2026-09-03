/**
 * Password verification for BOTH hash schemes present in User.passwordHash:
 *
 *   • bcrypt  ($2a$/$2b$/$2y$…) — new accounts, resets, admin-created (register.ts).
 *   • scrypt  ($scrypt$N=…$salt$hash) — MIGRATED from the legacy NestJS backend,
 *     which hashed with node:crypto scrypt. The format and params must match that
 *     code exactly (.archive/oldproject/…/auth/auth.service.ts) or every migrated
 *     user's login silently fails — which is exactly what happened before this.
 *
 * New passwords keep being written as bcrypt; this only adds the ability to READ
 * the legacy scrypt hashes, so there is no re-hash/migration of stored secrets.
 */
import { scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Legacy serialization: `$scrypt$N=32768,r=8,p=1,maxmem=67108864$<saltB64>$<hashB64>` */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$scrypt$")) {
    const parts = stored.split("$"); // ["", "scrypt", options, salt64, hash64]
    if (parts.length !== 5 || parts[1] !== "scrypt") return false;

    const params: Record<string, number> = {};
    for (const kv of parts[2].split(",")) {
      const [k, v] = kv.split("=");
      params[k] = Number(v);
    }
    if (!params.N || !params.r || !params.p) return false;

    const salt = Buffer.from(parts[3], "base64");
    const expected = Buffer.from(parts[4], "base64");
    if (expected.length === 0) return false;

    let derived: Buffer;
    try {
      derived = await scrypt(password, salt, expected.length, {
        N: params.N,
        r: params.r,
        p: params.p,
        // maxmem must be >= 128*N*r or Node throws; the legacy hash encodes 64 MiB.
        // Fall back to that if ever absent, so verification errors closed, not open.
        maxmem: params.maxmem || 64 * 1024 * 1024,
      });
    } catch {
      return false;
    }
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }

  // bcrypt — the new-scheme hashes
  return bcrypt.compare(password, stored);
}
