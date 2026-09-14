/**
 * Encrypts Shopify offline access/refresh tokens for `Store.accessTokenEnc` /
 * `refreshTokenEnc` (Bytes columns). AES-256-GCM.
 *
 * Layout: [1-byte format version][12-byte IV][16-byte auth tag][ciphertext].
 * The version byte lets a future key-rotation or algorithm change decrypt old
 * rows without guessing which format wrote them (see ADR-02).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const FORMAT_VERSION = 1;
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptToken(plaintext: string, keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptToken(enc: Buffer, keyB64: string): string {
  const version = enc[0];
  if (version !== FORMAT_VERSION) throw new Error(`token-crypto: unsupported format version ${version}`);
  const key = Buffer.from(keyB64, "base64");
  const iv = enc.subarray(1, 1 + IV_LEN);
  const tag = enc.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ciphertext = enc.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
