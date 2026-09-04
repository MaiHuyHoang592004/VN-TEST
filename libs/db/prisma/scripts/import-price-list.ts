/**
 * Imports the official OP Creative price list into the catalogue.
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types \
 *     prisma/scripts/import-price-list.ts <path-to.xlsx>
 *
 * Run `extract-price-list-images.ts` on the same workbook first: this writes
 * `/products/<key>.webp` into Product.thumbnail and that file has to exist.
 *
 * SHAPE. One spreadsheet row is one SIZE, not a product — the schema models
 * that as Product × Variant = ProductVariant, so nine "Glass Suncatcher" size
 * rows become ONE product with nine size SKUs. ./lib/price-list.ts does the
 * grouping and owns the keys.
 *
 * PRICES ARE USD, stored verbatim. The workbook quotes `PRODUCT COST (no
 * include shipping)` and shipping separately; salePrice is the COST, because
 * shipping is per-parcel and already differs between the first item and the
 * ones added to it — folding it into a per-unit price would overcharge every
 * multi-item order by that difference. Both salePrice and the tier-0
 * VariantPrice are written, because effectivePrice() falls back from one to the
 * other and a reader should not have to know which path they are on.
 *
 * OVERWRITE, not merge. A SKU this workbook no longer lists is removed — the
 * workbook is the catalogue's source of truth, and a stale SKU sells at a price
 * nobody agreed to. A SKU with orders behind it is ARCHIVED instead of deleted,
 * so those order rows still point at something real.
 *
 * An unpriced size is skipped: `priced` in listSkusWithMyPrice refuses to sell
 * a SKU with no price, so importing one would create a product nobody can
 * order. A product left with no priced size lands in DRAFT rather than ACTIVE.
 *
 * Idempotent: re-running updates by `key` rather than creating duplicates.
 * LOCAL by default; a remote target needs SEED_ALLOW_REMOTE=1.
 */
import { abbrev, readPriceList, skuPart, slug } from "./lib/price-list.ts";
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
  console.error("Usage: import-price-list.ts <path-to.xlsx>");
  process.exit(1);
}

const SOURCE = "OP Creative -VN.xlsx";

/**
 * Products already in the database under an older name.
 *
 * The first catalogue import called this product "Glass Suncatcher"; the
 * official list calls it "Glass Suncatcher for Window Hanging", which slugs
 * differently. Without this the import would create a SECOND product and leave
 * the old one selling ten SKUs at last month's prices. Renaming the row instead
 * keeps its id, so anything already pointing at it still resolves.
 */
const RENAMED_FROM: Record<string, string> = {
  "glass-suncatcher-for-window-hanging": "glass-suncatcher",
};

async function main() {
  const products = readPriceList(file);
  const sizeCount = products.reduce((n, p) => n + p.sizes.length, 0);
  console.log(`${products.length} products, ${sizeCount} sizes\n`);

  // SKU is globally unique and two products can abbreviate the same way, so
  // codes are claimed as they are minted rather than assumed distinct.
  const claimed = new Set<string>();
  const mintSku = (prefix: string, size: string) => {
    const base = `${prefix}-${skuPart(size)}`;
    let sku = base;
    for (let n = 2; claimed.has(sku); n++) sku = `${base}-${n}`;
    claimed.add(sku);
    return sku;
  };

  const drafted: string[] = [];
  let skus = 0;
  let removed = 0;
  let archived = 0;

  for (const p of products) {
    const priced = p.sizes.filter((s) => s.cost !== null && s.cost > 0);
    const status = priced.length ? "ACTIVE" : "DRAFT";
    if (!priced.length) drafted.push(p.name);

    const fields = {
      name: p.name,
      status,
      thumbnail: `/products/${p.key}.webp`,
      configs: {
        description: p.description || null,
        material: p.material || null,
        mockupUrl: p.mockupUrl || null,
        currency: "USD",
        source: SOURCE,
      },
    } as const;

    // Adopt the row under its old key before upserting, or the upsert misses it
    // and inserts a duplicate alongside.
    const oldKey = RENAMED_FROM[p.key];
    if (oldKey) {
      const stale = await prisma.product.findUnique({ where: { key: oldKey }, select: { id: true } });
      if (stale) {
        await prisma.product.update({ where: { id: stale.id }, data: { key: p.key } });
        console.log(`   renamed product "${oldKey}" → "${p.key}"`);
      }
    }

    const product = await prisma.product.upsert({
      where: { key: p.key },
      update: fields,
      create: { key: p.key, ...fields },
      select: { id: true },
    });

    console.log(`\n${p.name}  [${p.sheet}]  ${status} — ${priced.length}/${p.sizes.length} sizes priced`);

    const prefix = abbrev(p.name);
    const keep = new Set<number>();
    let position = 0;

    for (const s of priced) {
      const cost = s.cost as number;
      const variantKey = `${p.key}-${slug(s.size)}`;
      const variant = await prisma.variant.upsert({
        where: { key: variantKey },
        update: { name: s.size, status: "ACTIVE" },
        create: { name: s.size, key: variantKey, status: "ACTIVE" },
        select: { id: true },
      });

      const existing = await prisma.productVariant.findFirst({
        where: { productId: product.id, variantId: variant.id },
        select: { id: true, sku: true },
      });
      // Keep a SKU code that already exists — it may be printed on a shelf
      // label — and only mint one for a genuinely new row.
      if (existing?.sku) claimed.add(existing.sku);
      const sku = existing?.sku ?? mintSku(prefix, s.size);

      const data = { sku, salePrice: cost, status: "ACTIVE" as const, position: String(++position) };
      const row = existing
        ? await prisma.productVariant.update({ where: { id: existing.id }, data, select: { id: true } })
        : await prisma.productVariant.create({
            data: { productId: product.id, variantId: variant.id, ...data },
            select: { id: true },
          });
      keep.add(row.id);

      // Tier 0 is the base price every seller sees until a tier overrides it.
      await prisma.variantPrice.upsert({
        where: { productVariantId_tier: { productVariantId: row.id, tier: 0 } },
        update: { price: cost },
        create: { productVariantId: row.id, tier: 0, price: cost },
      });

      skus++;
      console.log(`   ${sku.padEnd(16)} ${s.size.padEnd(30)} $${cost.toFixed(2)}`);
    }

    for (const s of p.sizes) {
      if (priced.includes(s)) continue;
      console.log(`   ${"—".padEnd(16)} ${s.size.padEnd(30)} no price in the workbook — skipped`);
    }

    // Anything still attached to this product that the workbook has dropped.
    const stale = await prisma.productVariant.findMany({
      where: { productId: product.id, id: { notIn: [...keep] } },
      select: { id: true, sku: true, _count: { select: { orders: true } } },
    });
    for (const row of stale) {
      if (row._count.orders > 0) {
        await prisma.productVariant.update({ where: { id: row.id }, data: { status: "ARCHIVED" } });
        console.log(`   archived ${row.sku ?? row.id} — ${row._count.orders} orders behind it`);
        archived++;
      } else {
        await prisma.productVariant.delete({ where: { id: row.id } });
        console.log(`   removed  ${row.sku ?? row.id} — no longer in the workbook`);
        removed++;
      }
    }
  }

  // Removing a SKU leaves its size behind. Variant rows are shared across
  // products by design, so one going unused is not automatically garbage — but
  // one that NO product references is, and the admin variant list renders every
  // row it finds. Sweeping here keeps that list equal to what the workbook says.
  const orphans = await prisma.variant.deleteMany({ where: { productVariants: { none: {} } } });

  console.log(`\n${"=".repeat(64)}`);
  console.log(`imported : ${skus} SKUs across ${products.length} products`);
  if (orphans.count) console.log(`swept    : ${orphans.count} variants no product referenced`);
  if (removed) console.log(`removed  : ${removed} SKUs the workbook no longer lists`);
  if (archived) console.log(`archived : ${archived} SKUs kept for their orders`);
  if (drafted.length) console.log(`DRAFT    : ${drafted.join(", ")} — no priced size, cannot be sold`);
  console.log(
    `totals   : ${await prisma.product.count()} products · ` +
      `${await prisma.productVariant.count()} SKUs · ${await prisma.variant.count()} variants`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
