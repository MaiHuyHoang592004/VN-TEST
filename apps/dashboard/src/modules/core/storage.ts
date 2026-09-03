/**
 * File storage — the app's first real uploads (proof photos, label bundles).
 *
 * ONE function, ONE import site. Business logic calls `putObject` and never
 * learns which provider answered: `@vercel/blob` may be imported HERE and
 * nowhere else (storage.test.ts fails the build if it drifts), the driver is
 * chosen by env rather than by import, and the SDK is loaded dynamically so an
 * unused provider is never bundled.
 *
 * That is what makes leaving Vercel Blob a config change instead of a
 * refactor: an S3 driver is one more `case` and one more file, and not a line
 * of calling code moves. See doc 05 §A1b for the four rules this file exists
 * to keep.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredFile = {
  /** What the UI renders. */
  url: string;
  /** What a provider migration needs. Persist it alongside the url — without
   * the key, moving providers means parsing URLs, which is exactly the thing
   * that turns a config swap back into a project. */
  pathname: string;
};

export type StorageDriver = "blob" | "s3" | "local";

/**
 * A refusal the caller can branch on. Same shape as InvalidTransitionError:
 * a stable code the UI localises and the API returns verbatim, never English
 * a client has to parse.
 */
export type StorageErrorCode =
  | "file-too-large"
  | "not-an-image"
  | "invalid-key"
  | "storage-not-configured"
  | "too-many-files";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  // Fields assigned explicitly rather than via parameter properties — node
  // --test strips types instead of compiling them (modules/README.md).
  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

// ── Upload validation (a trust boundary — never lazy here) ───────────────────

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

/**
 * Everything we accept from a browser, checked before a byte is written.
 *
 * Type AND extension: the content type is client-supplied and trivially
 * forged, and the extension is what the local driver writes to disk and what
 * `/api/files` later infers a content type from. A mismatch between the two is
 * how "image/png" ends up served as a .html.
 */
export function assertImageUpload(file: File): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new StorageError("file-too-large", "Images must be 10MB or smaller.");
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!file.type.startsWith("image/") || !IMAGE_EXTENSIONS.includes(extension)) {
    throw new StorageError("not-an-image", "Upload a PNG, JPG or WEBP image.");
  }
}

/**
 * Keys are built from user data (tracking numbers), so they are input, not
 * trusted strings. Rejecting traversal here rather than in the local driver
 * covers every driver at once — an S3 key of `../` is a differently-shaped
 * mistake but still not one we want to make.
 */
function assertSafeKey(key: string): void {
  if (
    !key ||
    key.length > 512 ||
    key.startsWith("/") ||
    !/^[A-Za-z0-9._/-]+$/.test(key) ||
    key.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new StorageError("invalid-key", "That storage key is not allowed.");
  }
}

/**
 * Slug for the user-controlled half of a key. Dots are NOT kept: a slug is one
 * path component, the extension is the caller's to add, and keeping them means
 * `../../` slugs to `..-..` — a name assertSafeKey would then have to catch.
 * Two guards are better than one, but the first should not manufacture the
 * input the second exists to reject.
 */
export const storageSlug = (value: string): string =>
  value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";

/**
 * One column of the evidence-Json arrays (receipt shipments, ticket messages).
 *
 * Json rather than a File table because nothing ever queries ACROSS these:
 * they are only read back with the thing they document. The KEY is stored
 * beside the url (doc 05 §A1b R3) so changing storage provider stays a config
 * change instead of a URL-parsing exercise.
 */
export type StoredUpload = {
  url: string;
  key: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedById: string | null;
};

/** Per call, not per record. A dock photographs a pallet from a few angles and
 * a seller attaches a couple of photos of a damaged shirt; fifty in one request
 * is a mistake or an attack. */
export const MAX_FILES_PER_CALL = 10;

/**
 * Check a whole batch before ANY of it is written: a rejected third file must
 * not leave the first two orphaned in the bucket.
 *
 * Separate from storeImages so a caller that creates a column first (a ticket, so
 * its attachments can be keyed by id) can refuse the upload BEFORE the column
 * exists, instead of leaving an empty ticket behind when the photo is rejected.
 */
export function assertImageBatch(files: File[]): void {
  if (files.length > MAX_FILES_PER_CALL) {
    throw new StorageError("too-many-files", `Upload ${MAX_FILES_PER_CALL} images at most.`);
  }
  for (const file of files) assertImageUpload(file);
}

/**
 * Validate a batch of images, store them, and describe what landed.
 *
 * `prefix` is the caller's key layout (`tickets/12/`,
 * `receipts/receipt-3-shipment-4-`) — the driver only ever chooses the URL,
 * never the path.
 */
export async function storeImages(
  files: File[],
  options: { prefix: string; uploadedById: string | null },
): Promise<StoredUpload[]> {
  if (files.length === 0) return [];
  assertImageBatch(files);

  const stamp = Date.now();
  const stored: StoredUpload[] = [];
  for (const [index, file] of files.entries()) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const key = `${options.prefix}${stamp}-${index}.${storageSlug(extension)}`;
    const object = await putObject({
      key,
      body: await file.arrayBuffer(),
      contentType: file.type,
    });
    stored.push({
      url: object.url,
      key: object.pathname,
      filename: key.split("/").pop() ?? key,
      originalFilename: file.name,
      mimeType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      uploadedById: options.uploadedById,
    });
  }
  return stored;
}

// ── Driver selection ─────────────────────────────────────────────────────────

/** Local disk root. Dev and self-host only — see driverName(). */
const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR ?? ".uploads");

function driverName(): StorageDriver {
  const explicit = process.env.STORAGE_DRIVER;
  if (explicit === "blob" || explicit === "s3" || explicit === "local") return explicit;
  if (explicit) {
    throw new StorageError("storage-not-configured", `Unknown STORAGE_DRIVER "${explicit}".`);
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  // A serverless filesystem is read-only outside /tmp and does not survive the
  // invocation, so a deploy with no storage configured must say so loudly
  // rather than "succeed" into a directory that evaporates.
  if (process.env.VERCEL) {
    throw new StorageError(
      "storage-not-configured",
      "No storage configured: set BLOB_READ_WRITE_TOKEN, or STORAGE_DRIVER=s3 with its credentials.",
    );
  }
  return "local";
}

/**
 * Store bytes, return where they landed.
 *
 * Callers pass a key they control (`proofs/<tracking>-<epoch>.png`) so the
 * layout stays legible in a bucket listing; the driver may only decide the
 * URL, never the path.
 */
export async function putObject(input: {
  key: string;
  body: ArrayBuffer | Buffer | Uint8Array;
  contentType: string;
}): Promise<StoredFile> {
  assertSafeKey(input.key);
  const driver = driverName();
  if (driver === "blob") return putBlob(input);
  if (driver === "s3") return putS3(input);
  return putLocal(input);
}

const toBuffer = (body: ArrayBuffer | Buffer | Uint8Array): Buffer =>
  Buffer.isBuffer(body) ? body : Buffer.from(body as ArrayBuffer);

async function putBlob(input: {
  key: string;
  body: ArrayBuffer | Buffer | Uint8Array;
  contentType: string;
}): Promise<StoredFile> {
  const { put } = await import("@vercel/blob");
  const result = await put(input.key, toBuffer(input.body), {
    access: "public",
    contentType: input.contentType,
    // Blob suffixes a random string by default, which would make the stored
    // key differ from the one we asked for — and the whole point of keeping
    // the key is that it is predictable. Uniqueness is the caller's job (the
    // epoch in the key), so the suffix buys nothing here.
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  // ponytail: public blob URLs; ceiling = a proof photo is link-shareable by
  // anyone who has the URL. Upgrade path: access "private" + a signed GET
  // route — the DB already holds the key, so no backfill.
  return { url: result.url, pathname: input.key };
}

/**
 * The S3 exit, deliberately unimplemented rather than absent.
 *
 * ponytail: not built until something needs it — but the seam is HERE, so
 * "move off Vercel" is this function plus `npm i @aws-sdk/client-s3`, and the
 * shape of the change is visible today instead of being a promise in a doc.
 */
async function putS3(_input: {
  key: string;
  body: ArrayBuffer | Buffer | Uint8Array;
  contentType: string;
}): Promise<StoredFile> {
  throw new StorageError(
    "storage-not-configured",
    "STORAGE_DRIVER=s3 is not implemented yet — see doc 05 §A1b.",
  );
}

/**
 * Dev and self-host. Served back by app/api/files/[...path].
 *
 * ponytail: single-box storage — files live on whichever machine wrote them,
 * so this violates statelessness on more than one instance. Ceiling: fine for
 * `next dev` and a single container. Upgrade path: putS3 above.
 */
async function putLocal(input: {
  key: string;
  body: ArrayBuffer | Buffer | Uint8Array;
  contentType: string;
}): Promise<StoredFile> {
  const destination = path.join(uploadRoot(), input.key);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, toBuffer(input.body));
  return { url: `/api/files/${input.key}`, pathname: input.key };
}

// ── Reading back (local driver only) ─────────────────────────────────────────

/**
 * Resolve a request path to a real file inside the upload root.
 *
 * Returns null for anything that escapes it. Path segments arrive
 * URL-decoded, so `%2e%2e` is already `..` by the time we see it — hence the
 * resolve-then-compare rather than a string check on the input.
 */
export function resolveLocalPath(segments: string[]): string | null {
  const root = uploadRoot();
  const resolved = path.resolve(root, path.join(...segments));
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
  zip: "application/zip",
};

export const contentTypeFor = (filePath: string): string =>
  CONTENT_TYPES[filePath.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
