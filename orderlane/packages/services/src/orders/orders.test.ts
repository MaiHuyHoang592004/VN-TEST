import { after, test } from "node:test";
import assert from "node:assert/strict";

import { ConflictError, ValidationError } from "../errors.ts";
import { disconnect, seedCatalog, seedFullTenant, skipWithoutDb } from "../testing/harness.ts";
import { createOrder, createOrderIdempotent, getOrder, listOrders } from "./orders.ts";

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

const shipTo = {
  name: "A Buyer",
  line1: "1 Example Street",
  city: "Springfield",
  postcode: "12345",
  country: "us",
};

const orderInput = (overrides: Record<string, unknown> = {}) => ({
  channel: "web",
  buyer: { name: "A Buyer", email: "buyer@example.com" },
  shipTo,
  lines: [
    { sku: "mug-11oz", quantity: 2 },
    { sku: "print-12x16", quantity: 1 },
  ],
  ...overrides,
});

test("an order prices itself from the catalogue", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);

  const order = await createOrder(ctx, orderInput({ shippingMinor: 499 }));

  assert.equal(order.subtotalMinor, 2 * 1_250 + 3_400);
  assert.equal(order.totalMinor, 5_900 + 499);
  assert.equal(order.currency, "USD");
  assert.match(order.number, /^ORD-\d{5}$/);
  assert.equal(order.lines.length, 2);
  assert.equal(order.shipTo && (order.shipTo as { country: string }).country, "US", "country is normalised");
});

test("a line may override the catalogue price", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await createOrder(
    ctx,
    orderInput({ lines: [{ sku: "mug-11oz", quantity: 1, unitPriceMinor: 900 }] }),
  );
  assert.equal(order.totalMinor, 900);
});

test("every unknown SKU is reported at once, not one per attempt", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);

  await assert.rejects(
    () =>
      createOrder(
        ctx,
        orderInput({
          lines: [
            { sku: "mug-11oz", quantity: 1 },
            { sku: "ghost-1", quantity: 1 },
            { sku: "ghost-2", quantity: 1 },
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      const details = error.details as { sku: string; lineIndex: number }[];
      assert.deepEqual(details.map((d) => d.sku), ["ghost-1", "ghost-2"]);
      assert.deepEqual(details.map((d) => d.lineIndex), [1, 2]);
      return true;
    },
  );
});

test("declared totals are checked against the lines, not trusted", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);

  await assert.doesNotReject(() =>
    createOrder(ctx, orderInput({ shippingMinor: 499, declaredTotals: { subtotalMinor: 5_900, shippingMinor: 499, totalMinor: 6_399 } })),
  );

  await assert.rejects(
    () =>
      createOrder(
        ctx,
        orderInput({
          externalRef: "second",
          shippingMinor: 499,
          declaredTotals: { subtotalMinor: 1, shippingMinor: 499, totalMinor: 500 },
        }),
      ),
    ValidationError,
  );
});

test("a retried create with the same idempotency key makes one order", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const key = `order-idem-${Date.now().toString(36)}`;

  const first = await createOrderIdempotent(ctx, orderInput({ idempotencyKey: key }));
  const second = await createOrderIdempotent(ctx, orderInput({ idempotencyKey: key }));

  assert.equal(first.created, true);
  assert.equal(second.created, false, "the retry recognised itself");
  assert.equal(second.order.id, first.order.id);
  assert.equal(await ctx.db.order.count(), 1);
});

test("two simultaneous retries still make one order", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const key = `race-${Date.now().toString(36)}`;

  // The unique constraint, not an application-level check, is what makes this
  // true: a "does it exist yet?" read races with its own retry.
  const results = await Promise.allSettled([
    createOrder(ctx, orderInput({ idempotencyKey: key })),
    createOrder(ctx, orderInput({ idempotencyKey: key })),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof ConflictError);
  assert.equal(await ctx.db.order.count(), 1);
});

test("an order with no lines, or a zero quantity, is refused", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  await assert.rejects(() => createOrder(ctx, orderInput({ lines: [] })), ValidationError);
  await assert.rejects(
    () => createOrder(ctx, orderInput({ lines: [{ sku: "mug-11oz", quantity: 0 }] })),
    ValidationError,
  );
});

test("a rejected order leaves no half-written rows", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  await assert.rejects(() => createOrder(ctx, orderInput({ lines: [{ sku: "ghost", quantity: 1 }] })));
  assert.equal(await ctx.db.order.count(), 0);
  assert.equal(await ctx.db.orderLine.count(), 0);
});

test("personalisation is stored per line", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await createOrder(
    ctx,
    orderInput({ lines: [{ sku: "mug-11oz", quantity: 1, personalization: { name: "Sam", year: 2026 } }] }),
  );
  assert.deepEqual(order.lines[0]?.personalization, { name: "Sam", year: 2026 });
});

test("a line snapshots the SKU and title it was sold under", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  const order = await createOrder(ctx, orderInput({ lines: [{ sku: "mug-11oz", quantity: 1 }] }));

  // Renaming the variant afterwards must not rewrite what the order says.
  await ctx.db.variant.updateMany({ where: { sku: "MUG-11OZ" }, data: { title: "Renamed Later" } });

  const detail = await getOrder(ctx, order.id);
  assert.equal(detail.lines[0]?.title, "Ceramic Mug 11oz", "the order still says what was sold");
  assert.equal(detail.lines[0]?.variant?.title, "Renamed Later", "the catalogue has moved on");
});

test("the list is newest first, pages by cursor, and shows no fulfillment states yet", skipWithoutDb, async () => {
  const { ctx } = await seedFullTenant();
  await seedCatalog(ctx);
  for (let i = 0; i < 5; i++) {
    await createOrder(ctx, orderInput({ externalRef: `ref-${i}`, placedAt: new Date(Date.UTC(2026, 0, i + 1)) }));
  }

  const first = await listOrders(ctx, { limit: 3 });
  assert.equal(first.items.length, 3);
  assert.equal(first.hasMore, true);
  assert.deepEqual(first.items.map((o) => o.lineCount), [2, 2, 2]);
  assert.deepEqual(first.items[0]?.states, [], "no work has started, so there is no state to report");

  const second = await listOrders(ctx, { limit: 3, cursor: first.nextCursor });
  assert.equal(second.items.length, 2);
  assert.equal(second.hasMore, false);

  const all = [...first.items, ...second.items].map((o) => o.placedAt.getTime());
  assert.deepEqual(all, [...all].sort((a, b) => b - a), "strictly newest first across the page boundary");
});
