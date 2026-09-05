/**
 * Reading artwork out of a Google Drive folder link.
 *
 * Legacy `orders.image_url` is not an image — it is the Drive FOLDER the seller
 * drops artwork into (489/489 rows, audited 2026-09-04). Feeding that to an
 * <img> yields a login page, which is why every thumbnail in the orders table
 * rendered broken. This module turns the folder link into a real image url.
 *
 * Everything here is pure. The one network call lives in the route that uses
 * it, so the parsing and the ranking stay testable without a network — see
 * drive.test.ts, which runs against HTML Google actually served.
 *
 * No API key and no OAuth: `embeddedfolderview` serves any folder shared as
 * "anyone with the link", which is how these folders are already shared. That
 * is also the limit — a folder locked down to named accounts resolves to
 * nothing, and the caller shows its placeholder.
 */

export type DriveRef = { kind: "folder" | "file"; id: string };

export type DriveEntry = {
  id: string;
  name: string;
  /** As Drive reports it in the listing — trusted over the file extension. */
  mimeType: string;
};

/** A Drive id: the opaque alphanumeric key, never a path segment we invented. */
const ID = "[A-Za-z0-9_-]+";

const FOLDER_PATTERNS = [
  // .../drive/folders/<id> and .../drive/u/0/folders/<id>
  new RegExp(`drive\\.google\\.com/drive/(?:u/\\d+/)?folders/(${ID})`),
];

const FILE_PATTERNS = [
  // .../file/d/<id>/view
  new RegExp(`drive\\.google\\.com/file/d/(${ID})`),
  // .../open?id=<id> and .../uc?id=<id> — the pre-2016 forms, still in the wild
  new RegExp(`drive\\.google\\.com/(?:open|uc|thumbnail)\\?(?:[^#]*&)?id=(${ID})`),
];

/**
 * What a stored url points at, or null when it points at neither.
 *
 * Folder before file: a folder url also contains "/folders/", and matching file
 * patterns first would mis-read it.
 */
export function parseDriveUrl(url: string | null | undefined): DriveRef | null {
  if (!url) return null;
  for (const re of FOLDER_PATTERNS) {
    const m = re.exec(url);
    if (m) return { kind: "folder", id: m[1] };
  }
  for (const re of FILE_PATTERNS) {
    const m = re.exec(url);
    if (m) return { kind: "file", id: m[1] };
  }
  return null;
}

/**
 * The files in a public folder, from the HTML `embeddedfolderview` returns.
 *
 * One regex over the whole entry rather than a DOM parse: this runs on the
 * server for a page of orders, the markup is machine-generated and stable, and
 * pulling in a parser to read three fields is not a trade worth making. A
 * markup change degrades to "no entries" — a placeholder, never a crash.
 *
 * The MIME type comes from the type-icon url Drive embeds
 * (drive-thirdparty.googleusercontent.com/16/type/<mime>), which is the only
 * place the listing states it.
 */
export function parseFolderEntries(html: string): DriveEntry[] {
  const entry = new RegExp(
    `id="entry-(${ID})"` + // the file id
      `[\\s\\S]*?/16/type/([^"?]+)` + // the type icon => mime type
      `[\\s\\S]*?flip-entry-title">([^<]*)`, // the display name
    "g",
  );
  const out: DriveEntry[] = [];
  for (const m of html.matchAll(entry)) {
    out.push({ id: m[1], name: decodeHtml(m[3]).trim(), mimeType: m[2] });
  }
  return out;
}

/** Drive escapes titles; & and quotes are all that reach us in practice. */
function decodeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Images a browser renders natively — what we want in an <img> if we can get it. */
const WEB_IMAGE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * Formats Drive renders a thumbnail for even though a browser cannot show the
 * file itself. Good enough for a 64px cell, and far better than a placeholder
 * on a folder that holds only print files.
 */
const THUMBNAILABLE = new Set([
  "application/pdf",
  "application/postscript", // .ai, .eps
  "image/vnd.adobe.photoshop",
]);

/**
 * Which file in the folder IS the artwork.
 *
 * A fulfilment folder is not one image — it is the print files plus a mockup
 * ("4161766969.ai", "4161766969.tif", "mk.png"). A seller scanning the table
 * wants the mockup, so `mk.*` wins outright; that naming is the warehouse's own
 * convention and the reason this is a rank rather than "first image".
 *
 * Ranking is stable (equal ranks keep folder order), so a folder always shows
 * the same file — a thumbnail that changed between page loads would read as a
 * bug.
 */
export function pickArtworkFile(entries: DriveEntry[]): DriveEntry | null {
  let best: { entry: DriveEntry; rank: number } | null = null;
  for (const entry of entries) {
    const rank = rankOf(entry);
    if (rank === null) continue;
    if (!best || rank < best.rank) best = { entry, rank };
  }
  return best?.entry ?? null;
}

function rankOf(entry: DriveEntry): number | null {
  const mime = entry.mimeType.toLowerCase();
  if (WEB_IMAGE.has(mime)) return /^mk\./i.test(entry.name) ? 0 : 1;
  if (mime.startsWith("image/")) return 2; // .tif and friends: Drive renders these
  if (THUMBNAILABLE.has(mime)) return 3;
  return null; // folders, archives, text — nothing to show
}

/** A rendered thumbnail at the width the caller asks for, not the full file. */
export function driveThumbnailUrl(fileId: string, width: number): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
}

/** Where "open the artwork" goes: Drive's own viewer, with its permissions. */
export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/** The folder listing, as HTML. The only network call in this feature. */
export function driveFolderListUrl(folderId: string): string {
  return `https://drive.google.com/embeddedfolderview?id=${folderId}#grid`;
}
