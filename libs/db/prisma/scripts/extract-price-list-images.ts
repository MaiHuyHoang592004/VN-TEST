/**
 * Pulls the product photos OUT of the price list workbook and into the app.
 *
 *   node --experimental-strip-types \
 *     prisma/scripts/extract-price-list-images.ts <path-to.xlsx>
 *
 * Touches no database. Writes `apps/dashboard/public/products/<key>.webp`,
 * which is exactly what `import-price-list.ts` stores in `Product.thumbnail`,
 * so the two are run as a pair whenever the workbook changes — they share the
 * key function in ./lib/price-list.ts so the filename and the column can never
 * disagree.
 *
 * WHY THIS IS NOT A CELL READ. The photos are drawing objects anchored OVER
 * column B, not values inside it — `sheet_to_json` returns an empty string
 * there. The bytes live in `xl/media/`; `xl/drawings/drawingN.xml` says which
 * image sits on which ROW, and `_rels` maps its relationship id to a filename.
 * Matching that row back to the product name above it is the whole job.
 *
 * The originals are 1-4 MB screenshots, 46 MB for the set — too heavy to commit
 * and far past what a 64px table thumbnail needs. They are re-encoded to WebP
 * at 800px, enough for a product detail view at 2x.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { SHEETS, parsePriceList, part, readWorkbook } from "./lib/price-list.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: extract-price-list-images.ts <path-to.xlsx>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../../../../apps/dashboard/public/products");

/** Longest edge in the committed image. A table thumbnail is 64px and a detail
 * view a few hundred; 800 leaves room for both on a 2x display. */
const MAX_EDGE = 800;

async function main() {
  const wb = readWorkbook(file);
  const products = parsePriceList(wb);
  const byRow = new Map(products.map((p) => [`${p.sheet}:${p.row}`, p]));

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  let written = 0;
  const seen = new Set<string>();

  for (const { name: sheetName, drawing } of SHEETS) {
    const rels = part(wb, `xl/drawings/_rels/${drawing}.xml.rels`).toString("utf8");
    const target = Object.fromEntries(
      [...rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], basename(m[2])]),
    );

    const xml = part(wb, `xl/drawings/${drawing}.xml`).toString("utf8");
    // One match per photo: the <xdr:from> row it is pinned to, then the
    // relationship id of the image it draws.
    const anchors = [
      ...xml.matchAll(/<xdr:from><xdr:col>\d+<\/xdr:col>.*?<xdr:row>(\d+)<\/xdr:row>.*?r:embed="(rId\d+)"/gs),
    ];

    for (const [, rowText, rid] of anchors) {
      const row = Number(rowText);
      // An anchor sits on the product's own row, but tolerate it drifting down
      // into that product's size rows: walk up to the nearest product start.
      let product = byRow.get(`${sheetName}:${row}`);
      for (let i = row; !product && i >= 0; i--) product = byRow.get(`${sheetName}:${i}`);
      if (!product) {
        console.warn(`   ⚠ photo at ${sheetName} row ${row + 1} matches no product — skipped`);
        continue;
      }
      // Two products in this workbook share one photo. First anchor wins, so
      // the later product simply goes without rather than borrowing a picture
      // of something else.
      if (seen.has(product.key)) continue;
      seen.add(product.key);

      await sharp(part(wb, `xl/media/${target[rid]}`))
        .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(join(outDir, `${product.key}.webp`));
      written++;
      console.log(`   ${`${product.key}.webp`.padEnd(52)} ← ${target[rid]}`);
    }
  }

  const missing = products.filter((p) => !seen.has(p.key));
  const bytes = readdirSync(outDir).reduce((n, f) => n + readFileSync(join(outDir, f)).length, 0);
  console.log(`\n${written} photos → apps/dashboard/public/products  (${(bytes / 1e6).toFixed(1)} MB)`);
  if (missing.length) console.log(`NO PHOTO (${missing.length}): ${missing.map((p) => p.name).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
