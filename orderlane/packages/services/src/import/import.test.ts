import { after, test } from "node:test";
import assert from "node:assert/strict";

import { ConflictError } from "../errors.ts";
import { disconnect, seedCatalog, seedFullTenant, skipWithoutDb } from "../testing/harness.ts";
import { parsePriceMinor } from "./adapters/catalog.ts";
import { commitImport, previewImport, stageImport } from "./jobs.ts";

after(async () => {
  if (skipWithoutDb.skip) return;
  await disconnect();
});

const catalogRow = (over: Record<string, unknown> = {}) => ({
  product_slug: "ceramic-mug",
  product_title: "Ceramic Mug",
  sku: "mug-11oz",
  variant_title: "Ceramic Mug 11oz",
  price: "12.50",
  ...over,
});

const orderRow = (over: Record<string, unknown> = {}) => ({
  order_ref: "WEB-1001",
  channel: "web",
  sku: "mug-11oz",
  quantity: 2,
  buyer_name: "A Buyer",
  ship_line1: "1 Example Street",
  ship_city: "Springfield",
  ship_country: "US",
  ...over,
});

test("prices arrive in four formats and land as minor units", () => {
  assert.equal(parsePriceMinor("12.50"), 1_250);
  assert.equal(parsePriceMinor("$12.50"), 1_250);
  assert.equal(parsePriceMinor("12,50"), 1_250, "decimal comma");
  assert.equal(parsePriceMinor("1.234,50"), 123_450, "european thousands");
  assert.equal(parsePriceMinor("1,234.50"), 123_450, "anglo thousands");
  assert.equal(parsePriceMinor(12.5), 1_250);
  assert.equal(parsePriceMinor("twelve fifty"), null, "not coerced to NaN, reported");
  assert.equal(parsePriceMinor(""), null);
});

test("staging writes nothing outside the staging tables", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const staged = await stageImport(ctx, {
    kind: "CATALOG",
    filename: "catalogue.xlsx",
    rows: [catalogRow(), catalogRow({ sku: "mug-15oz", variant_title: "Ceramic Mug 15oz", price: "15.00" })],
  });

  assert.deepEqual(staged.summary, { total: 2, create: 2, update: 0, invalid: 0, skipped: 0 });
  assert.equal(await ctx.db.product.count(), 0, "the preview has not touched the catalogue");
  assert.equal(await ctx.db.variant.count(), 0);
  assert.equal(await ctx.db.importRow.count({ where: { jobId: staged.jobId } }), 2);
});

test("the preview says exactly what the commit will do", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const staged = await stageImport(ctx, {
    kind: "CATALOG",
    filename: "catalogue.xlsx",
    rows: [catalogRow(), catalogRow({ sku: "bad", price: "not a price" })],
  });

  const preview = await previewImport(ctx, staged.jobId);
  assert.deepEqual(preview.summary, { total: 2, create: 1, update: 0, invalid: 1, skipped: 0 });

  const result = await commitImport(ctx, staged.jobId);
  assert.equal(result.applied, 1, "exactly what the preview promised");
  assert.equal(await ctx.db.variant.count(), 1);
});

test("one invalid row explains itself per field and does not sink the batch", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const staged = await stageImport(ctx, {
    kind: "CATALOG",
    filename: "catalogue.xlsx",
    rows: [
      catalogRow({ sku: "a-1" }),
      catalogRow({ sku: "", price: "nope", product_slug: "Not A Slug" }),
      catalogRow({ sku: "a-3" }),
    ],
  });

  const preview = await previewImport(ctx, staged.jobId);
  const bad = preview.rows.find((r) => r.lineNumber === 2)!;
  assert.equal(bad.status, "INVALID");
  assert.deepEqual(
    (bad.issues as { field: string; code: string }[]).map((i) => [i.field, i.code]).sort(),
    [["price", "invalid_price"], ["product_slug", "invalid_slug"], ["sku", "required"]],
  );

  const result = await commitImport(ctx, staged.jobId);
  assert.equal(result.applied, 2, "the other two rows still imported");
});

test("re-uploading a corrected file touches only the row that changed", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const rows = [
    catalogRow({ sku: "r-1", price: "10.00" }),
    catalogRow({ sku: "r-2", price: "20.00" }),
    catalogRow({ sku: "r-3", price: "30.00" }),
  ];
  const first = await stageImport(ctx, { kind: "CATALOG", filename: "v1.xlsx", rows });
  await commitImport(ctx, first.jobId);

  // The operator fixes one price and sends the whole file again.
  const corrected = [rows[0]!, { ...rows[1]!, price: "22.50" }, rows[2]!];
  const second = await stageImport(ctx, { kind: "CATALOG", filename: "v2.xlsx", rows: corrected });

  assert.deepEqual(second.summary, { total: 3, create: 0, update: 1, invalid: 0, skipped: 2 });

  await commitImport(ctx, second.jobId);
  const variant = await ctx.db.variant.findFirstOrThrow({ where: { sku: "R-2" } });
  assert.equal(variant.priceMinor, 2_250);
  assert.equal(await ctx.db.variant.count(), 3, "no duplicates");
});

test("the same row twice in one file is caught before the database has to", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const staged = await stageImport(ctx, {
    kind: "CATALOG",
    filename: "dupes.xlsx",
    rows: [catalogRow({ sku: "d-1" }), catalogRow({ sku: "d-1" })],
  });

  assert.equal(staged.summary.create, 1);
  assert.equal(staged.summary.skipped, 1);

  const preview = await previewImport(ctx, staged.jobId);
  assert.ok(
    (preview.rows[1]!.issues as { code: string }[]).some((i) => i.code === "duplicate_in_file"),
  );
});

test("re-uploading a byte-identical file is reported, not blocked", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const rows = [catalogRow({ sku: "same-1" })];
  const first = await stageImport(ctx, { kind: "CATALOG", filename: "a.xlsx", rows });
  const second = await stageImport(ctx, { kind: "CATALOG", filename: "a-again.xlsx", rows });

  assert.equal(second.previousJobId, first.jobId, "the operator is told, and decides");
});

test("rows sharing an order reference become one order with several lines", skipWithoutDb, async () => {
  // The case a one-order-per-row importer gets wrong: it would turn this into
  // two orders, which is wrong in the buyer's inbox and wrong in the postage.
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);

  const staged = await stageImport(ctx, {
    kind: "ORDERS",
    filename: "orders.xlsx",
    rows: [orderRow({ sku: "mug-11oz", quantity: 2 }), orderRow({ sku: "print-12x16", quantity: 1 })],
  });
  const result = await commitImport(ctx, staged.jobId);

  assert.equal(result.applied, 2);
  assert.equal(await ctx.db.order.count(), 1, "one order");

  const order = await ctx.db.order.findFirstOrThrow({ where: { externalRef: "WEB-1001" }, include: { lines: true } });
  assert.equal(order.lines.length, 2);
  assert.equal(order.subtotalMinor, 2 * 1_250 + 3_400, "totals recomputed from the lines that exist");
  assert.equal(order.totalMinor, order.subtotalMinor);
});

test("correcting one line's quantity updates that line and recomputes the order", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);

  const rows = [orderRow({ sku: "mug-11oz", quantity: 2 }), orderRow({ sku: "print-12x16", quantity: 1 })];
  const first = await stageImport(ctx, { kind: "ORDERS", filename: "o1.xlsx", rows });
  await commitImport(ctx, first.jobId);

  const corrected = [rows[0]!, { ...rows[1]!, quantity: 3 }];
  const second = await stageImport(ctx, { kind: "ORDERS", filename: "o2.xlsx", rows: corrected });
  assert.deepEqual(second.summary, { total: 2, create: 0, update: 1, invalid: 0, skipped: 1 });

  await commitImport(ctx, second.jobId);
  const order = await ctx.db.order.findFirstOrThrow({ where: { externalRef: "WEB-1001" }, include: { lines: true } });
  assert.equal(order.lines.length, 2, "still two lines, not three");
  assert.equal(order.subtotalMinor, 2 * 1_250 + 3 * 3_400);
});

test("a row whose SKU vanished between preview and commit fails alone", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);

  const staged = await stageImport(ctx, {
    kind: "ORDERS",
    filename: "orders.xlsx",
    rows: [orderRow({ sku: "mug-11oz" }), orderRow({ order_ref: "WEB-2", sku: "print-12x16" })],
  });

  // The catalogue moves on after the preview — a preview is a forecast.
  await ctx.db.variant.deleteMany({ where: { sku: "PRINT-12X16" } });

  const result = await commitImport(ctx, staged.jobId);
  assert.equal(result.applied, 1);
  assert.equal(result.failed, 1);
  assert.match(result.failures[0]!.message, /no longer in the catalogue/);

  const rows = await ctx.db.importRow.findMany({ where: { jobId: staged.jobId }, orderBy: { lineNumber: "asc" } });
  assert.equal(rows[0]?.status, "APPLIED");
  assert.equal(rows[1]?.status, "INVALID", "the failure is recorded on the row that caused it");
  assert.ok((rows[1]?.issues as { code: string }[]).some((i) => i.code === "apply_failed"));
});

test("a committed job cannot be committed again", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const staged = await stageImport(ctx, { kind: "CATALOG", filename: "once.xlsx", rows: [catalogRow({ sku: "once-1" })] });
  await commitImport(ctx, staged.jobId);
  await assert.rejects(() => commitImport(ctx, staged.jobId), ConflictError);
});

test("imports are per tenant: the same file in two tenants creates two catalogues", skipWithoutDb, async () => {
  const a = await seedFullTenant();
  const b = await seedFullTenant();
  const rows = [catalogRow({ sku: "shared-sku" })];

  const first = await stageImport(a.ctx, { kind: "CATALOG", filename: "c.xlsx", rows });
  await commitImport(a.ctx, first.jobId);

  const second = await stageImport(b.ctx, { kind: "CATALOG", filename: "c.xlsx", rows });
  assert.deepEqual(second.summary, { total: 1, create: 1, update: 0, invalid: 0, skipped: 0 },
    "another tenant's applied hash must not make this a skip");

  await commitImport(b.ctx, second.jobId);
  assert.equal(await a.ctx.db.variant.count(), 1);
  assert.equal(await b.ctx.db.variant.count(), 1);
});

test("two overlapping files committed at once apply each row exactly once", skipWithoutDb, async () => {
  // The guarantee ImportApplication exists for. Both jobs stage cleanly — the
  // second cannot see the first's rows as applied, because neither has
  // committed yet — so the collision has to be caught at write time, inside
  // the same transaction as the write it protects.
  const { ctx } = await seedFullTenant();
  const shared = catalogRow({ sku: "overlap-1", price: "10.00" });

  const a = await stageImport(ctx, {
    kind: "CATALOG",
    filename: "a.xlsx",
    rows: [shared, catalogRow({ sku: "only-a" })],
  });
  const b = await stageImport(ctx, {
    kind: "CATALOG",
    filename: "b.xlsx",
    rows: [shared, catalogRow({ sku: "only-b" })],
  });

  assert.equal(a.summary.create, 2, "both jobs planned the shared row as new");
  assert.equal(b.summary.create, 2);

  const [resultA, resultB] = await Promise.all([commitImport(ctx, a.jobId), commitImport(ctx, b.jobId)]);

  assert.equal(resultA.applied + resultB.applied, 3, "three distinct rows of work");
  assert.equal(resultA.skipped + resultB.skipped, 1, "the overlap was applied once and skipped once");
  assert.equal(resultA.failed + resultB.failed, 0, "a duplicate is not a failure");

  assert.equal(await ctx.db.variant.count(), 3);
  assert.equal(
    await ctx.db.importApplication.count({ where: { kind: "CATALOG" } }),
    3,
    "one application record per distinct row, whatever the concurrency",
  );
});
