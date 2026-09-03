/**
 * GET /api/files/<key> — serves what the LOCAL storage driver wrote.
 *
 * Only the local driver produces these URLs (Blob and S3 serve their own), so
 * in production this route simply finds nothing. It exists so that dev and a
 * self-hosted single box behave identically to a deploy with Blob configured.
 *
 * The one rule that matters: a path may not escape the upload root.
 * `resolveLocalPath` resolves first and compares against the root rather than
 * scanning the input for "..", because Next hands segments already
 * URL-decoded — `%2e%2e%2f` is a plain `../` by the time it arrives.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { contentTypeFor, resolveLocalPath } from "@/modules/core/storage.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params;
  const filePath = resolveLocalPath(segments);
  if (!filePath) return new Response("Not found", { status: 404 });

  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return new Response("Not found", { status: 404 });

  // size+mtime, not a content hash: proof photos are written once and read
  // from a station on every render, and hashing megabytes per request to
  // learn what stat already knows is work for nothing.
  const etag = `W/"${info.size}-${info.mtimeMs}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
    headers: {
      "Content-Type": contentTypeFor(filePath),
      "Content-Length": String(info.size),
      ETag: etag,
      // Private: these are warehouse parcels, not assets. No CDN copies.
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
