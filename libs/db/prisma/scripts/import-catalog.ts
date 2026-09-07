/**
 * Imports the official product catalogue from an .xlsx workbook.
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types \
 *     prisma/scripts/import-catalog.ts <path-to.xlsx>
 *
 * Only the "Ready to Add" sheet is read. "Needs Review" and "Source Summary"
 * are ignored on purpose: every row in them is missing a price, and this system
 * refuses to sell an unpriced SKU (`priced` in listSkusWithMyPrice), so
 * importing them would create products nobody can order.
 *
 * SHAPE. One spreadsheet row is one SIZE of one product, not a product. The
 * schema models that as Product × Variant = ProductVariant (the sellable SKU),
 * so ten "Glass Suncatcher" rows become ONE product with ten size variants.
 * Grouping is by the Product Name column.
 *
 * PRICES ARE VND, stored verbatim. Decimal(12,2) holds 150000.00 exactly; no
 * conversion is applied and none should be, or the number in the database stops
 * matching the number in the price list. Both salePrice and the tier-0
 * VariantPrice are written, because effectivePrice() falls back from one to the
 * other and a reader should not have to know which path they are on.
 *
 * The workbook's Description column has no column in the schema; it is kept in
 * Product.configs so it is not lost, and no UI renders it today.
 *
 * Idempotent: re-running updates by `key` rather than creating duplicates.
 * LOCAL by default; a remote target needs SEED_ALLOW_REMOTE=1.
 */
import { readFileSync } from "node:fs";
import XLSX from "xlsx-js-style";

import { prisma } from "../../src/client.ts";

const url = process.env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const host = url.replace(/:[^:@/]+@/, ":***@").replace(/\?.*/, "");

// Same opt-in seed-demo.ts uses: local by default, and a remote target needs
// an environment variable you cannot arrive at by pressing up-arrow in a shell.
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error(`Refusing to import: ${host} is not a local database.`);
  console.error("Set SEED_ALLOW_REMOTE=1 if that is genuinely what you want.");
  process.exit(1);
}
if (!isLocal) {
  console.warn(`\n⚠  REMOTE DATABASE: ${host}`);
  console.warn(`⚠  This changes data that real signed-in users will see.\n`);
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: import-catalog.ts <path-to.xlsx>");
  process.exit(1);
}

type Row = {
  "Product Name": string;
  Size: string;
  "Price (VND)": number | string;
  Description: string;
  "Thumbnail URL": string;
  "Source Image URL": string;
};

/** URL- and SKU-safe: lowercase, non-alphanumerics collapsed to one dash. */
const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** SKU codes are read aloud on a floor, so they lose the punctuation: a size of
 * "Cir7.8in" becomes CIR78IN, "Rec9.5x7" becomes REC95X7. */
const skuPart = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

/** First letter of each word, so "Glass Suncatcher" -> GSC-…, capped at 4. */
const productAbbrev = (name: string) => {
  const initials = name.split(/\s+/).map((w) => w[0]).join("").toUpperCase();
  return (initials.length >= 3 ? initials : name.replace(/[^A-Za-z]/g, "").toUpperCase()).slice(0, 4);
};

async function main() {
  const wb = XLSX.read(readFileSync(file));
  const sheet = wb.Sheets["Ready to Add"];
  if (!sheet) {
    console.error(`No "Ready to Add" sheet in ${file}. Found: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });

  const byProduct = new Map<string, Row[]>();
  for (const r of rows) {
    const name = String(r["Product Name"] ?? "").trim();
    const size = String(r.Size ?? "").trim();
    const price = Number(r["Price (VND)"]);
    if (!name || !size || !Number.isFinite(price) || price <= 0) {
      console.log(`→ SKIPPED row (name/size/price incomplete): ${JSON.stringify({ name, size, price: r["Price (VND)"] })}`);
      continue;
    }
    if (!byProduct.has(name)) byProduct.set(name, []);
    byProduct.get(name)!.push(r);
  }

  for (const [name, group] of byProduct) {
    const key = slug(name);
    const abbrev = productAbbrev(name);
    const product = await prisma.product.upsert({
      where: { key },
      update: {
        name,
        status: "ACTIVE",
        thumbnail: group[0]["Thumbnail URL"] || null,
        configs: { description: group[0].Description || null, currency: "VND", source: "filtered_product_catalog.xlsx" },
      },
      create: {
        name,
        key,
        status: "ACTIVE",
        thumbnail: group[0]["Thumbnail URL"] || null,
        configs: { description: group[0].Description || null, currency: "VND", source: "filtered_product_catalog.xlsx" },
      },
      select: { id: true },
    });
    console.log(`\n${name}  (key: ${key})  — ${group.length} sizes`);

    let position = 0;
    for (const r of group) {
      const size = String(r.Size).trim();
      const price = Number(r["Price (VND)"]);
      const variantKey = `${key}-${slug(size)}`;
      const variant = await prisma.variant.upsert({
        where: { key: variantKey },
        update: { name: size, status: "ACTIVE" },
        create: { name: size, key: variantKey, status: "ACTIVE" },
        select: { id: true },
      });

      const sku = `${abbrev}-${skuPart(size)}`;
      const existing = await prisma.productVariant.findFirst({
        where: { productId: product.id, variantId: variant.id },
        select: { id: true },
      });
      const row = existing
        ? await prisma.productVariant.update({
            where: { id: existing.id },
            data: { sku, salePrice: price, status: "ACTIVE", position: String(++position) },
            select: { id: true },
          })
        : await prisma.productVariant.create({
            data: {
              productId: product.id,
              variantId: variant.id,
              sku,
              salePrice: price,
              status: "ACTIVE",
              position: String(++position),
            },
            select: { id: true },
          });

      // Tier 0 is the base price every seller sees until a tier overrides it.
      await prisma.variantPrice.upsert({
        where: { productVariantId_tier: { productVariantId: row.id, tier: 0 } },
        update: { price },
        create: { productVariantId: row.id, tier: 0, price },
      });

      console.log(`   ${sku.padEnd(14)} ${size.padEnd(11)} ${price.toLocaleString("vi-VN")} ₫`);
    }
  }

  console.log(
    `\nproducts: ${await prisma.product.count()} · SKUs: ${await prisma.productVariant.count()} · variants: ${await prisma.variant.count()}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
