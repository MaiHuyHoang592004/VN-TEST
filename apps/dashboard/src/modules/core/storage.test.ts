/**
 * Storage: the round trip, the two refusals, and the rule that keeps the
 * provider swappable.
 *
 * The last one is the point of the file. Every other guarantee here is code
 * anyone can read; "@vercel/blob is imported in exactly one place" is a
 * property that decays silently the first time someone imports `put` in a
 * service because it was convenient — and nobody notices until the day we try
 * to leave Vercel. A test is the only thing that keeps it true.
 *
 * No database: storage touches none. This runs under the same
 * `node --test src/modules/**\/*.test.ts` sweep as the money suites.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";

import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../..");
const UPLOAD_DIR = path.join(HERE, ".storage-test-uploads");

// Set BEFORE the module is imported: driverName() reads the env per call, but
// pinning it here keeps the suite independent of whoever's shell has a Blob
// token exported.
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.STORAGE_DRIVER = "local";

const { assertImageUpload, putObject, resolveLocalPath, storageSlug } = await import("./storage.ts");

after(async () => {
  await rm(UPLOAD_DIR, { recursive: true, force: true });
});

/** The smallest valid PNG: an 8-byte signature is enough to prove bytes
 * survive the round trip unaltered. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const upload = (name: string, type: string, size: number) =>
  new File([new Uint8Array(size)], name, { type });

test("a file round-trips through the local driver, bytes intact", async () => {
  const stored = await putObject({
    key: "proofs/1Z999AA10123456784-1721650000.png",
    body: PNG,
    contentType: "image/png",
  });

  assert.equal(stored.pathname, "proofs/1Z999AA10123456784-1721650000.png");
  assert.equal(stored.url, "/api/files/proofs/1Z999AA10123456784-1721650000.png");

  const onDisk = await readFile(path.join(UPLOAD_DIR, stored.pathname));
  assert.deepEqual(onDisk, PNG, "what came back is what went in");
});

test("the key is what we asked for — the url is the driver's business", async () => {
  // R3 in doc 05 §A1b: the pathname is what a provider migration reads, so a
  // driver may decide the URL and may NOT decide the key.
  const stored = await putObject({ key: "labels/labels-2026-07-22.zip", body: PNG, contentType: "application/zip" });
  assert.equal(stored.pathname, "labels/labels-2026-07-22.zip");
});

/** assert.throws returns undefined, so the code is checked in the validator. */
const refuses = (fn: () => void, code: string, message?: string) =>
  assert.throws(fn, (e: Error & { code?: string }) => e.code === code, message);

test("an 11MB upload is refused before anything is written", () => {
  refuses(() => assertImageUpload(upload("huge.png", "image/png", 11 * 1024 * 1024)), "file-too-large");
});

test("a PDF wearing an image content type is refused", () => {
  // The content type is client-supplied. The extension is what the local
  // driver writes and what /api/files infers a type from later, so both have
  // to agree before a byte is stored.
  refuses(() => assertImageUpload(upload("invoice.pdf", "image/png", 1024)), "not-an-image");
  refuses(() => assertImageUpload(upload("shot.png", "application/pdf", 1024)), "not-an-image");
});

test("a 10MB PNG is accepted — the limit is inclusive", () => {
  assert.doesNotThrow(() => assertImageUpload(upload("proof.png", "image/png", 10 * 1024 * 1024)));
  assert.doesNotThrow(() => assertImageUpload(upload("proof.JPEG", "image/jpeg", 512)));
});

test("a traversing key never reaches the disk", async () => {
  // Keys are built from tracking numbers, which are user input.
  for (const key of ["../escape.png", "proofs/../../escape.png", "/etc/passwd", "proofs/a b.png"]) {
    await assert.rejects(
      () => putObject({ key, body: PNG, contentType: "image/png" }),
      (e: Error & { code?: string }) => e.code === "invalid-key",
      `key must be refused: ${key}`,
    );
  }
  const written = await readdir(UPLOAD_DIR, { recursive: true });
  assert.ok(!written.some((f) => String(f).includes("escape")), "nothing escaped the root");
});

test("the serving route refuses paths outside the upload root", () => {
  assert.equal(resolveLocalPath(["..", "secrets.env"]), null);
  assert.equal(resolveLocalPath(["proofs", "..", "..", "secrets.env"]), null);
  assert.ok(resolveLocalPath(["proofs", "ok.png"])?.startsWith(UPLOAD_DIR));
});

test("slugging makes a tracking number safe to key on", () => {
  assert.equal(storageSlug("1Z999AA1/0123 456784"), "1Z999AA1-0123-456784");
  assert.equal(storageSlug("../../"), "item");
});

test("@vercel/blob is imported in exactly one place", async () => {
  // doc 05 §A1b R1. This is the assertion that keeps the provider swap a
  // config change: one import site means an S3 driver is a new `case` in
  // storage.ts and nothing else moves. Add future SDKs to the list.
  const sdks = ["@vercel/blob", "@aws-sdk/client-s3"];
  const offenders: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      // storage.ts owns the drivers; this test names the SDKs to check.
      const relative = path.relative(SRC, full);
      if (/^modules\/core\/storage(\.|\.test\.)/.test(relative)) continue;
      const source = await readFile(full, "utf8");
      if (sdks.some((sdk) => source.includes(`"${sdk}"`) || source.includes(`'${sdk}'`))) {
        offenders.push(relative);
      }
    }
  };
  await walk(SRC);

  assert.deepEqual(
    offenders,
    [],
    "a storage SDK leaked outside modules/core/storage.ts — import putObject instead",
  );
});
