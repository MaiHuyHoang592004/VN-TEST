/**
 * M7 Task 27 (adapted) — synthetic order-processing throughput benchmark.
 *
 * Seeds ORDER_COUNT paid, mapped, single-line synthetic IngestionRecords
 * (no facility fixture, so every one also produces a real NO_ROUTE
 * RoutingDecision via routeAndReserve — that's real ingestion work too, not
 * skipped), then drives the exact IngestionLoop/registry WorkerModule wires
 * in production (NestFactory.createApplicationContext, same as main.ts)
 * until the batch clears, reporting throughput and per-record processing
 * lag. Run: npm run benchmark:orders -w @fulfillflow/worker
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { prisma } from "@fulfillflow/db";
import { WorkerModule, INGESTION_LOOP } from "../src/worker.module.js";
import type { IngestionLoop } from "../src/ingestion/ingestion-loop.js";

const ORDER_COUNT = Number(process.env.BENCHMARK_ORDERS ?? 300);

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function main() {
  const slug = `bench-orders-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: { organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com` } });
  const product = await prisma.product.create({ data: { name: slug, handle: slug } });
  const item = await prisma.inventoryItem.create({ data: { code: `${slug}-item`, name: slug, kind: "FINISHED_GOOD" } });
  await prisma.sku.create({ data: { id: item.id, productId: product.id } });
  await prisma.storeSkuMapping.create({ data: { storeId: store.id, skuId: item.id, externalVariantId: "gid://shopify/ProductVariant/5001" } });

  const seedStart = performance.now();
  const records = await Promise.all(Array.from({ length: ORDER_COUNT }, (_, i) => prisma.ingestionRecord.create({ data: {
    organizationId: org.id, storeId: store.id, source: "SHOPIFY_WEBHOOK", topic: "orders/create",
    dedupeKey: `bench-${crypto.randomUUID()}`,
    rawPayload: {
      id: 8_000_000 + i, admin_graphql_api_id: `gid://shopify/Order/${8_000_000 + i}`, name: `#${8_000_000 + i}`,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), financial_status: "paid", currency: "USD",
      email: "bench@example.test",
      shipping_address: { name: "Bench Buyer", address1: "1 Bench St", city: "Austin", province: "Texas", zip: "78701", country_code: "US", phone: "+15555550100" },
      line_items: [{ id: 1, admin_graphql_api_id: `gid://shopify/LineItem/${i}`, variant_id: 5001, sku: "BENCH", title: "Bench item", quantity: 1, properties: [] }],
    },
  } })));
  const seedMs = performance.now() - seedStart;

  const ctx = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
  const ingestionLoop = ctx.get<IngestionLoop>(INGESTION_LOOP);

  const processStart = performance.now();
  let claimed = 0;
  let ticks = 0;
  while (claimed < ORDER_COUNT) {
    const n = await ingestionLoop.tick();
    claimed += n;
    ticks++;
    if (n === 0) break; // safety valve — should never happen with no lease contention
  }
  const processMs = performance.now() - processStart;

  const finished = await prisma.ingestionRecord.findMany({ where: { id: { in: records.map((r) => r.id) } }, select: { status: true, createdAt: true, processedAt: true } });
  const lagsMs = finished.filter((r) => r.processedAt).map((r) => r.processedAt!.getTime() - r.createdAt.getTime()).sort((a, b) => a - b);
  const statusCounts = finished.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});

  const report = {
    benchmark: "order-processing",
    ranAt: new Date().toISOString(),
    node: process.version,
    orderCount: ORDER_COUNT,
    seedMs: Math.round(seedMs),
    ticksToClear: ticks,
    processMs: Math.round(processMs),
    throughputOrdersPerSec: Number((claimed / (processMs / 1000)).toFixed(1)),
    processingLagMsP50: lagsMs.length ? Math.round(percentile(lagsMs, 50)) : null,
    processingLagMsP95: lagsMs.length ? Math.round(percentile(lagsMs, 95)) : null,
    finalStatusCounts: statusCounts,
  };
  console.log(JSON.stringify(report, null, 2));

  const orderIds = (await prisma.order.findMany({ where: { organizationId: org.id }, select: { id: true } })).map((o) => o.id);
  await prisma.routingDecision.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.exceptionCase.deleteMany({ where: { organizationId: org.id } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.ingestionRecord.deleteMany({ where: { storeId: store.id } });
  await prisma.storeSkuMapping.deleteMany({ where: { storeId: store.id } });
  await prisma.sku.delete({ where: { id: item.id } });
  await prisma.inventoryItem.delete({ where: { id: item.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.store.delete({ where: { id: store.id } });
  await prisma.organization.delete({ where: { id: org.id } });

  await ctx.close();
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
