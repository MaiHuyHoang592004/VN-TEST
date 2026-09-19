import { after, test } from "node:test";
import assert from "node:assert/strict";

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.ts";
import { disconnect, seedFullTenant, skipWithoutDb } from "../testing/harness.ts";
import { createProduct, createVariant, listProducts, resolveSkus } from "./products.ts";

/**
 * These tests do not reset the database between files.
 *
 * Every test seeds its own tenant, so the product's own isolation boundary is
 * what keeps them apart — which means the suite can run its files in parallel,
 * and a leak between tenants would show up as a failing test rather than as a
 * clean run. A global truncate in each file would fight that: node --test runs
 * files in separate processes, so one file's reset wipes another's fixtures
 * mid-assertion.
 */
after(async () => {
  if (skipWithoutDb.skip) return;
  await disconnect();
});

test("a product and its variants round-trip", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const product = await createProduct(ctx, { slug: "ceramic-mug", title: "Ceramic Mug" });
  const variant = await createVariant(ctx, product.id, {
    sku: "mug-11oz",
    title: "Ceramic Mug 11oz",
    priceMinor: 1_250,
    options: { size: "11oz", colour: "white" },
  });

  assert.equal(variant.sku, "MUG-11OZ", "SKUs are normalised on the way in, once");
  assert.equal(variant.priceMinor, 1_250);
  assert.deepEqual(variant.options, { size: "11oz", colour: "white" });
});

test("a bad slug is rejected with the field named", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await assert.rejects(
    () => createProduct(ctx, { slug: "Not A Slug", title: "x" }),
    (error: unknown) => error instanceof ValidationError && Array.isArray(error.details),
  );
});

test("slug and SKU are unique per tenant, and collide as conflicts", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const product = await createProduct(ctx, { slug: "mug", title: "Mug" });
  await assert.rejects(() => createProduct(ctx, { slug: "mug", title: "Another" }), ConflictError);

  await createVariant(ctx, product.id, { sku: "m-1", title: "One", priceMinor: 100 });
  await assert.rejects(
    () => createVariant(ctx, product.id, { sku: "M-1", title: "Same after normalising", priceMinor: 100 }),
    ConflictError,
  );
});

test("the same slug in two tenants is not a collision", skipWithoutDb, async () => {
  const a = await seedFullTenant();
  const b = await seedFullTenant();
  await createProduct(a.ctx, { slug: "mug", title: "Mug" });
  await assert.doesNotReject(() => createProduct(b.ctx, { slug: "mug", title: "Mug" }));
});

test("a variant cannot be hung off another tenant's product", skipWithoutDb, async () => {
  const a = await seedFullTenant();
  const b = await seedFullTenant();
  const theirs = await createProduct(b.ctx, { slug: "theirs", title: "Theirs" });

  // A clean 404, not a foreign-key error surfacing from the driver.
  await assert.rejects(
    () => createVariant(a.ctx, theirs.id, { sku: "x-1", title: "x", priceMinor: 1 }),
    NotFoundError,
  );
});

test("a viewer may read the catalogue but not change it", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const viewer = { ...ctx, actor: { ...ctx.actor, role: "VIEWER" as const } };
  await assert.rejects(() => createProduct(viewer, { slug: "nope", title: "Nope" }), ForbiddenError);
  await assert.doesNotReject(() => listProducts(viewer));
});

test("SKUs resolve in one batch, and misses are simply absent", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const product = await createProduct(ctx, { slug: "p", title: "P" });
  await createVariant(ctx, product.id, { sku: "a-1", title: "A", priceMinor: 100 });
  await createVariant(ctx, product.id, { sku: "b-2", title: "B", priceMinor: 200 });

  const resolved = await resolveSkus(ctx, ["a-1", " B-2 ", "ghost", "a-1"]);
  assert.equal(resolved.size, 2, "duplicates and whitespace are the caller's mess, not an error");
  assert.equal(resolved.get("A-1")?.priceMinor, 100);
  assert.equal(resolved.get("B-2")?.priceMinor, 200);
  assert.equal(resolved.has("GHOST"), false, "a miss is an absence the caller can report on");
});

test("listing pages by cursor and visits every product once", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  for (let i = 0; i < 7; i++) {
    await createProduct(ctx, { slug: `p-${i}`, title: `Product ${i}` });
  }

  const seen: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 6; guard++) {
    const page = await listProducts(ctx, { limit: 3, cursor });
    seen.push(...page.items.map((p) => p.slug));
    if (!page.hasMore) break;
    cursor = page.nextCursor;
  }

  assert.equal(seen.length, 7);
  assert.equal(new Set(seen).size, 7, "no product appears on two pages");
  assert.deepEqual(seen, ["p-6", "p-5", "p-4", "p-3", "p-2", "p-1", "p-0"], "newest first");
});

test("a mangled cursor returns page one rather than failing", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await createProduct(ctx, { slug: "only", title: "Only" });
  const page = await listProducts(ctx, { cursor: "!!!not-a-cursor!!!" });
  assert.equal(page.items.length, 1);
});

test("the list carries a variant count without an N+1", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  const product = await createProduct(ctx, { slug: "counted", title: "Counted" });
  await createVariant(ctx, product.id, { sku: "c-1", title: "One", priceMinor: 1 });
  await createVariant(ctx, product.id, { sku: "c-2", title: "Two", priceMinor: 2 });

  const page = await listProducts(ctx);
  assert.equal(page.items.find((p) => p.slug === "counted")?.variantCount, 2);
});
