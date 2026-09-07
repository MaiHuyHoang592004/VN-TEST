/**
 * Imports the fulfillment order history from the OP × Xưởng workbook.
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types \
 *     prisma/scripts/import-order-history.ts <path-to.xlsx>
 *
 * Run the catalogue import first — every row is matched to an existing SKU and
 * nothing is invented to make a row fit.
 *
 * THE MATCH. The sheet carries the shop's own product names ("glass
 * suncatcher", "Wooden Acrylic Keepsake") AND two columns that normalise them
 * to the official price list: `Pro chuẩn` and `Size chuẩn`. Those are what this
 * reads. Every one of the workbook's rows resolves through them, so a row that
 * does NOT resolve means the catalogue and this history have genuinely drifted
 * — it is reported and skipped rather than guessed at.
 *
 * MONEY. `Giá` is the workshop cost of the whole row in VND (220000 for two at
 * 110000), and `Đơn giá` is the unit price. The system stores USD, so the total
 * is converted at RATE and lands in `baseCost` — the cost to produce, which is
 * what the column means. Some `Đơn giá` cells hold prose rather than a number
 * ("Xưởng thanh toán phí ship 5.45$"), so anything non-numeric is dropped
 * rather than coerced to NaN. The raw VND figure is kept in `configs.source`,
 * because a converted number is a derived one and the original should survive.
 *
 * THE DATE. The workbook has ONE date column, `Ngày`, and does not say whether
 * it is when the order arrived or when it shipped. It fills `placedAt`, which
 * is NOT NULL and has to come from somewhere; `fulfilledAt` and the shipment's
 * `shippedAt` are left null rather than assuming the two are the same day. The
 * raw serial is kept in `configs.source.day`. If that column does mean the ship
 * date, say so and re-run — this import is idempotent.
 *
 * Idempotent by `idempotencyKey`, which is the unique column the schema
 * provides for exactly this: a re-run updates the same 489 orders instead of
 * creating a second set.
 */
import { readFileSync } from "node:fs";
import XLSX from "xlsx-js-style";

import { prisma } from "../../src/client.ts";

const url = process.env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const host = url.replace(/:[^:@/]+@/, ":***@").replace(/\?.*/, "");

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
  console.error("Usage: import-order-history.ts <path-to.xlsx>");
  process.exit(1);
}

/** The sheet holding the history. The name is the shop's, not a description:
 * it holds every product, not only suncatchers. */
const SHEET = "FF glass suncatcher";

/** Whose history this is. Created if absent, as a SELLER with no password —
 * sign-in is the email OTP, same as any other account that was never given
 * one. */
const SELLER_EMAIL = "patrick.nguyen@opcreative.vn";
const SELLER_NAME = "Patrick Nguyen";

/** VND per USD, for the workshop costs. A judgement, not a fact in the file:
 * chosen with the user against the period the history covers (May–Sep 2026).
 * Change it and re-run; every cost is recomputed from the VND kept in configs. */
const RATE = 26_000;

/** Source label, so a row imported from here is identifiable later. */
const SOURCE = "FBM GW - Patrick Nguyen OPxXưởng.xlsx";

/** The workbook's status words. Anything else is reported, not guessed. */
const STATUS: Record<string, "SHIPPED" | "IN_PRODUCTION"> = {
  "Đã ship": "SHIPPED",
  "Đang sản xuất": "IN_PRODUCTION",
};

/** Headers and values both carry stray spaces and trailing newlines — "Tracking
 * " and "Norfolk\n" are real values in this file. Normalise both or every
 * lookup silently misses. */
const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** Excel's serial day. Its epoch is 1899-12-30 because 1900 is wrongly a leap
 * year in the format, and the offset absorbs that. */
const excelDate = (serial: number) => new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);

const money = (v: unknown): number | null => {
  const n = Number(norm(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

type Row = Record<string, string>;

async function main() {
  const wb = XLSX.read(readFileSync(file));
  const sheet = wb.Sheets[SHEET];
  if (!sheet) {
    console.error(`No "${SHEET}" sheet in ${file}. Found: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }

  // A row without an Order ID is spreadsheet padding — this sheet has ~6,800 of
  // them below the data.
  const rows: Row[] = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [norm(k), norm(v)])))
    .filter((r) => r["Order ID"]);
  console.log(`${rows.length} rows with an order id\n`);

  const seller = await prisma.user.upsert({
    where: { email: SELLER_EMAIL },
    update: { name: SELLER_NAME },
    create: { email: SELLER_EMAIL, name: SELLER_NAME, roles: ["SELLER"], status: "ACTIVE" },
    select: { id: true, email: true },
  });
  console.log(`seller: ${seller.email}`);

  // One warehouse exists and everything was made there; if a second ever does,
  // this needs a column in the workbook to choose between them.
  const warehouse = await prisma.warehouse.findFirst({
    where: { deletedAt: null },
    select: { id: true, code: true },
    orderBy: { id: "asc" },
  });
  console.log(`warehouse: ${warehouse?.code ?? "none — orders will be unassigned"}\n`);

  const skus = await prisma.productVariant.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      productId: true,
      variantId: true,
      product: { select: { name: true } },
      variant: { select: { name: true } },
    },
  });
  const skuKey = (p: string, s: string) => `${norm(p).toLowerCase()}::${norm(s).toLowerCase()}`;
  const index = new Map(skus.map((s) => [skuKey(s.product.name, s.variant.name), s]));

  let created = 0;
  let updated = 0;
  let shipments = 0;
  const unmatched = new Map<string, number>();
  const badStatus = new Map<string, number>();
  const noDate: string[] = [];

  for (const r of rows) {
    const externalId = r["Order ID"];
    const sku = index.get(skuKey(r["Pro chuẩn"], r["Size chuẩn"]));
    if (!sku) {
      const k = `${r["Pro chuẩn"]} / ${r["Size chuẩn"]}`;
      unmatched.set(k, (unmatched.get(k) ?? 0) + 1);
      continue;
    }

    const serial = Number(r["Ngày"]);
    if (!Number.isFinite(serial) || serial < 20_000) {
      noDate.push(externalId);
      continue;
    }
    const placedAt = excelDate(serial);

    const status = STATUS[r.__EMPTY];
    if (!status) badStatus.set(r.__EMPTY || "(blank)", (badStatus.get(r.__EMPTY || "(blank)") ?? 0) + 1);

    const quantity = Math.max(1, Number(r.SL) || 1);
    const totalVnd = money(r["Giá"]);
    const unitVnd = money(r["Đơn giá"]);

    const address = {
      name: r.Name || null,
      company: r.Company || null,
      line1: r.Address || null,
      line2: r["Address Line 2"] || null,
      city: r.City || null,
      state: r.State || null,
      zip: r.Zipcode || null,
      country: r.Country || null,
    };

    const data = {
      externalId,
      marketplace: r.Marketplace || null,
      source: SOURCE,
      customerId: seller.id,
      warehouseId: warehouse?.id ?? null,
      productId: sku.productId,
      variantId: sku.variantId,
      productVariantId: sku.id,
      quantity,
      // A shipped order is a finished one; anything else has produced nothing
      // this workbook records.
      filled: status === "SHIPPED" ? quantity : 0,
      status: status ?? ("PENDING" as const),
      placedAt,
      baseCost: totalVnd === null ? null : Number((totalVnd / RATE).toFixed(2)),
      internalNote: r.Note || null,
      imageUrl: r["Link thiết kế"] || null,
      configs: {
        source: {
          file: SOURCE,
          sheet: SHEET,
          day: serial,
          status: r.__EMPTY || null,
          productType: r["Product Type"] || null,
          size: r.Size || null,
          // Kept verbatim: baseCost above is these divided by a rate someone
          // chose, and the original should outlive the choice.
          giaVnd: totalVnd,
          donGiaVnd: unitVnd,
          rate: RATE,
          photoUrl: r["Link ảnh"] || null,
        },
      },
    };

    const key = `fbm-history:${externalId}`;
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey: key },
      select: { id: true, shippingAddressId: true },
    });

    let orderId: number;
    if (existing) {
      const addr = existing.shippingAddressId
        ? await prisma.address.update({ where: { id: existing.shippingAddressId }, data: address, select: { id: true } })
        : await prisma.address.create({ data: address, select: { id: true } });
      await prisma.order.update({ where: { id: existing.id }, data: { ...data, shippingAddressId: addr.id } });
      orderId = existing.id;
      updated++;
    } else {
      const addr = await prisma.address.create({ data: address, select: { id: true } });
      const row = await prisma.order.create({
        data: { ...data, idempotencyKey: key, shippingAddressId: addr.id },
        select: { id: true },
      });
      orderId = row.id;
      created++;
    }

    // The carrier record. Kept on Shipment rather than Order because the schema
    // already models an order shipping more than once, and a reship is exactly
    // what this history will eventually contain.
    const tracking = r.Tracking || null;
    const label = r["Link Label"] || null;
    if (tracking || label) {
      const parcel = {
        widthCm: money(r["rộng cm"]),
        heightCm: money(r["Cao cm"]),
        lengthCm: money(r["Dài cm"]),
        weightGram: money(r["Cân nặng Gram"]),
      };
      const found = await prisma.shipment.findFirst({
        where: { orderId, trackingNumber: tracking },
        select: { id: true },
      });
      const fields = {
        trackingNumber: tracking,
        labelUrl: label,
        trackingStatus: status === "SHIPPED" ? "shipped" : null,
        configs: { source: SOURCE, parcel },
      };
      if (found) await prisma.shipment.update({ where: { id: found.id }, data: fields });
      else await prisma.shipment.create({ data: { orderId, ...fields } });
      shipments++;
    }
  }

  console.log(`${"=".repeat(64)}`);
  console.log(`orders    : ${created} created, ${updated} updated`);
  console.log(`shipments : ${shipments}`);
  if (unmatched.size) {
    console.log(`\nNO SKU (skipped):`);
    for (const [k, n] of [...unmatched].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${k}`);
  }
  if (noDate.length) console.log(`\nNO DATE (skipped): ${noDate.length} — ${noDate.slice(0, 10).join(", ")}`);
  if (badStatus.size) {
    console.log(`\nUNKNOWN STATUS (imported as PENDING):`);
    for (const [k, n] of badStatus) console.log(`   ${String(n).padStart(4)}  ${k}`);
  }
  console.log(
    `\ntotals    : ${await prisma.order.count()} orders · ` +
      `${await prisma.shipment.count()} shipments · ${await prisma.address.count()} addresses`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
