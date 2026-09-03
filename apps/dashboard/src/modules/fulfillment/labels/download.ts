/**
 * Bulk label download — every label for a day's parcels, merged and zipped.
 *
 * Port of legacy's POST /orders/utils/download-label, with its two pathologies
 * removed:
 *
 *  1. IT SLEPT 5 SECONDS BETWEEN DOWNLOADS. At the 200-label cap that is
 *     sixteen minutes inside one request — long past any platform's timeout,
 *     so the feature reliably failed exactly when it was most useful. Here the
 *     fetches run five at a time with no sleep. If a provider rate-limits,
 *     throttle THAT provider rather than punishing every URL.
 *  2. IT REPORTED SUCCESS FOR LABELS IT NEVER FETCHED. A failed download was
 *     swallowed, so the zip was quietly short and nobody knew until a parcel
 *     had no label on it. Here every failure comes back named.
 *
 * // ponytail: ~200 fetches + a merge inside one 300s function is tight but
 * // fits, and the cap is the knob. Ceiling: if it ever times out, HALVE the
 * // cap before reaching for a queue — a background job for something a human
 * // is standing there waiting for is a worse experience, not a better one.
 */
// archiver 8 is ESM with NAMED exports only — there is no default factory, so
// `import archiver from "archiver"` fails at runtime rather than at build.
import { ZipArchive } from "archiver";
import { PDFDocument } from "pdf-lib";

import { putObject } from "../../core/storage.ts";

/** Legacy's MAXIMUM_DOWNLOAD_LABELS. */
export const MAX_LABELS = 200;
const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 20_000;

export type LabelSource = {
  /** What the operator will look for if this one fails. */
  reference: string;
  url: string;
};

export type DownloadResult = {
  url: string;
  pathname: string;
  merged: number;
  failed: Array<{ reference: string; reason: string }>;
  skipped: number;
};

/**
 * Turn a label URL into something that actually returns a PDF.
 *
 * Two providers hand out human-facing pages rather than files, and legacy
 * learned both the hard way (common.utils.ts:53-126):
 *   · PirateShip share links are a web app; the PDF comes from their GraphQL
 *     endpoint keyed on the share token in the URL.
 *   · Google Drive view links need the export-download form, or you get an
 *     HTML interstitial saved as "label.pdf".
 */
export async function resolveLabelUrl(url: string): Promise<string | { graphql: string; token: string }> {
  const pirateShip = /ship\.pirateship\.com\/share\/([A-Za-z0-9_-]+)/.exec(url);
  if (pirateShip) {
    return { graphql: "https://ship.pirateship.com/graphql", token: pirateShip[1] };
  }
  const drive =
    /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/.exec(url) ??
    /drive\.google\.com\/open\?id=([A-Za-z0-9_-]+)/.exec(url);
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`;
  return url;
}

async function fetchLabel(source: LabelSource): Promise<Uint8Array> {
  const resolved = await resolveLabelUrl(source.url);

  if (typeof resolved !== "string") {
    const response = await fetch(resolved.graphql, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "DownloadLabelsByShareTokenQuery",
        variables: { shareToken: resolved.token },
        query:
          "query DownloadLabelsByShareTokenQuery($shareToken: String!) { downloadLabelsByShareToken(shareToken: $shareToken) { url } }",
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`PirateShip HTTP ${response.status}`);
    const body = (await response.json()) as { data?: { downloadLabelsByShareToken?: { url?: string } } };
    const direct = body.data?.downloadLabelsByShareToken?.url;
    if (!direct) throw new Error("PirateShip returned no label url");
    return fetchLabel({ reference: source.reference, url: direct });
  }

  const response = await fetch(resolved, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // A login page or an interstitial is HTML, and saving it with a .pdf name is
  // how legacy produced zips full of unopenable files.
  if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
    throw new Error("not a PDF (the link may need a login)");
  }
  return bytes;
}

/** Run `work` over `items` with a fixed number in flight. */
async function pooled<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}

/**
 * Fetch every label, merge them into one PDF per group, zip, store, return a
 * link. The merged PDF is what a floor prints in one go; the zip keeps the
 * originals so a single bad label can be reprinted without the batch.
 */
export async function buildLabelBundle(
  sources: LabelSource[],
  key: string,
): Promise<DownloadResult> {
  const capped = sources.slice(0, MAX_LABELS);
  const skipped = sources.length - capped.length;

  const settled = await pooled(capped, CONCURRENCY, async (source) => {
    try {
      return { source, bytes: await fetchLabel(source) };
    } catch (e) {
      return { source, reason: e instanceof Error ? e.message : "download failed" };
    }
  });

  const ok = settled.filter((r): r is { source: LabelSource; bytes: Uint8Array } => "bytes" in r);
  const failed = settled
    .filter((r): r is { source: LabelSource; reason: string } => "reason" in r)
    .map((r) => ({ reference: r.source.reference, reason: r.reason }));

  const merged = await PDFDocument.create();
  for (const { bytes } of ok) {
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    } catch {
      // A PDF that downloads but will not parse still belongs in the zip as
      // its original bytes — the operator can open it by hand.
    }
  }

  const zip = new ZipArchive({ zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  zip.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    zip.on("end", resolve);
    zip.on("error", reject);
  });

  if (merged.getPageCount() > 0) {
    zip.append(Buffer.from(await merged.save()), { name: "all-labels.pdf" });
  }
  for (const { source, bytes } of ok) {
    zip.append(Buffer.from(bytes), { name: `labels/${source.reference}.pdf` });
  }
  if (failed.length) {
    zip.append(
      Buffer.from(failed.map((f) => `${f.reference}\t${f.reason}`).join("\n")),
      { name: "FAILED.txt" },
    );
  }
  await zip.finalize();
  await done;

  const stored = await putObject({
    key,
    body: Buffer.concat(chunks),
    contentType: "application/zip",
  });
  return { url: stored.url, pathname: stored.pathname, merged: ok.length, failed, skipped };
}
