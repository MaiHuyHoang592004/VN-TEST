import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { prisma } from "@fulfillflow/db";
import {
  WorkerModule, OUTBOX_LOOP, INGESTION_LOOP, PII_RETENTION_SCHEDULER, TOKEN_REFRESH_SCHEDULER, INVENTORY_RECONCILE_SCHEDULER,
} from "./worker.module.js";
import type { OutboxLoop } from "./queue/outbox-loop.js";
import type { IngestionLoop } from "./ingestion/ingestion-loop.js";
import type { PiiRetentionScheduler } from "./schedulers/pii-retention.scheduler.js";
import type { ShopifyTokenRefreshScheduler } from "./schedulers/shopify-token-refresh.scheduler.js";
import type { InventoryReconcileScheduler } from "./core/inventory/inventory-reconcile.service.js";

const ctx = await NestFactory.createApplicationContext(WorkerModule, { logger: ["error", "warn", "log"] });
const outboxLoop = ctx.get<OutboxLoop>(OUTBOX_LOOP);
const ingestionLoop = ctx.get<IngestionLoop>(INGESTION_LOOP);
const piiRetentionScheduler = ctx.get<PiiRetentionScheduler>(PII_RETENTION_SCHEDULER);
const tokenRefreshScheduler = ctx.get<ShopifyTokenRefreshScheduler>(TOKEN_REFRESH_SCHEDULER);
const inventoryReconcileScheduler = ctx.get<InventoryReconcileScheduler>(INVENTORY_RECONCILE_SCHEDULER);
const ac = new AbortController();
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { console.log(JSON.stringify({ msg: "worker stopping", sig })); ac.abort(); });
console.log(JSON.stringify({ msg: "worker started" }));
await Promise.all([
  outboxLoop.run(ac.signal),
  ingestionLoop.run(ac.signal),
  piiRetentionScheduler.run(ac.signal),
  tokenRefreshScheduler.run(ac.signal),
  inventoryReconcileScheduler.run(ac.signal),
]);
await ctx.close();
await prisma.$disconnect();
console.log(JSON.stringify({ msg: "worker stopped" }));
