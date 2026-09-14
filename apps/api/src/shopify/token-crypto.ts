/**
 * Encrypts Shopify offline access tokens for `Store.accessTokenEnc` /
 * `refreshTokenEnc` (Bytes columns). AES-256-GCM, IV prefixed to the output —
 * matches the column comment in the Prisma schema.
 *
 * Layout: [12-byte IV][16-byte auth tag][ciphertext].
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptToken(plaintext: string, keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptToken(enc: Buffer, keyB64: string): string {
  const key = Buffer.from(keyB64, "base64");
  const iv = enc.subarray(0, IV_LEN);
  const tag = enc.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = enc.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
