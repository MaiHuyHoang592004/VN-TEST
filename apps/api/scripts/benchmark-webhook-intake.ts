/**
 * M7 Task 27 (adapted) — synthetic webhook intake benchmark.
 *
 * The plan calls for a k6 script; no k6 binary is installed in this (or,
 * presumably, any CI) environment and this repo has no existing load-test
 * tooling to extend, so this is a small Node-based substitute. Boots the
 * real AppModule on a real listening port (NOT supertest against an
 * unlisten()'d server — under real concurrency that produced spurious
 * ECONNRESET churn that looked like server errors but was purely a test-
 * harness artifact of supertest's implicit per-request ephemeral listen)
 * and drives it with plain `fetch`.
 *
 * Sends CONCURRENCY-at-a-time valid-HMAC POST /webhooks/shopify requests,
 * DUPLICATE_FRACTION of them reusing an already-sent X-Shopify-Webhook-Id
 * — some of those genuinely concurrent with their own original, which is
 * exactly the race this benchmark was built to exercise (see
 * HANDOVER-M7 — it caught a real upsert() race in webhooks.controller.ts
 * that only true concurrent duplicates trigger, not sequential ones).
 * Reports p50/p95/p99 latency, throughput, and error rate. Run:
 *   npm run benchmark:webhook -w @fulfillflow/api
 */
import "reflect-metadata";
import { createHmac } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { prisma } from "@fulfillflow/db";
import { AppModule } from "../src/app.module.js";

const TOTAL_REQUESTS = Number(process.env.BENCHMARK_REQUESTS ?? 500);
const CONCURRENCY = Number(process.env.BENCHMARK_CONCURRENCY ?? 20);
const DUPLICATE_FRACTION = 0.1;

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function main() {
  const apiSecret = process.env.SHOPIFY_API_SECRET!;
  const slug = `bench-webhook-${crypto.randomUUID()}`;
  const org = await prisma.organization.create({ data: { slug, name: slug } });
  const store = await prisma.store.create({ data: { organizationId: org.id, provider: "SHOPIFY", name: slug, externalStoreId: `${slug}.myshopify.com` } });

  const app: INestApplication = await NestFactory.create(AppModule, { rawBody: true, logger: false });
  await app.listen(0);
  const address = app.getHttpServer().address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

  const seenIds: string[] = [];
  const latenciesMs: number[] = [];
  let errors = 0;
  const errorSamples: string[] = [];

  function nextWebhookId(i: number): string {
    if (i > 0 && Math.random() < DUPLICATE_FRACTION && seenIds.length > 0) {
      return seenIds[Math.floor(Math.random() * seenIds.length)]!;
    }
    const id = `bench-${crypto.randomUUID()}`;
    seenIds.push(id);
    return id;
  }

  async function sendOne(i: number): Promise<void> {
    const webhookId = nextWebhookId(i);
    const body = JSON.stringify({ id: 9_000_000 + i, admin_graphql_api_id: `gid://shopify/Order/${9_000_000 + i}`, financial_status: "paid" });
    const hmac = createHmac("sha256", apiSecret).update(Buffer.from(body)).digest("base64");
    const start = performance.now();
    try {
      const res = await fetch(`${baseUrl}/webhooks/shopify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Hmac-Sha256": hmac,
          "X-Shopify-Shop-Domain": `${slug}.myshopify.com`,
          "X-Shopify-Webhook-Id": webhookId,
          "X-Shopify-Topic": "orders/create",
        },
        body,
      });
      if (res.status !== 200) {
        errors++;
        if (errorSamples.length < 3) errorSamples.push(`HTTP ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      errors++;
      if (errorSamples.length < 3) errorSamples.push(String(err));
    } finally {
      latenciesMs.push(performance.now() - start);
    }
  }

  const overallStart = performance.now();
  let next = 0;
  async function worker() {
    while (next < TOTAL_REQUESTS) {
      const i = next++;
      await sendOne(i);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const totalMs = performance.now() - overallStart;

  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const uniqueRecords = await prisma.ingestionRecord.count({ where: { storeId: store.id } });

  const report = {
    benchmark: "webhook-intake",
    ranAt: new Date().toISOString(),
    node: process.version,
    totalRequests: TOTAL_REQUESTS,
    concurrency: CONCURRENCY,
    duplicateFraction: DUPLICATE_FRACTION,
    totalMs: Math.round(totalMs),
    throughputReqPerSec: Number((TOTAL_REQUESTS / (totalMs / 1000)).toFixed(1)),
    errorCount: errors,
    errorRate: Number((errors / TOTAL_REQUESTS).toFixed(4)),
    errorSamples,
    latencyMsP50: Math.round(percentile(sorted, 50)),
    latencyMsP95: Math.round(percentile(sorted, 95)),
    latencyMsP99: Math.round(percentile(sorted, 99)),
    latencyMsMax: Math.round(sorted[sorted.length - 1]!),
    ingestionRecordsCreated: uniqueRecords,
    dedupeCheck: uniqueRecords === seenIds.length ? "PASS — one row per unique webhook id, duplicates deduped, including genuinely concurrent ones" : `MISMATCH: ${uniqueRecords} rows for ${seenIds.length} unique ids`,
  };
  console.log(JSON.stringify(report, null, 2));

  await prisma.ingestionRecord.deleteMany({ where: { storeId: store.id } });
  await prisma.store.delete({ where: { id: store.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await app.close();
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
