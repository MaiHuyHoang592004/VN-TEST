import { Module } from "@nestjs/common";
import { prisma } from "@fulfillflow/db";
import { HandlerRegistry } from "./queue/handler-registry.js";
import { OutboxLoop } from "./queue/outbox-loop.js";
import { IngestionLoop } from "./ingestion/ingestion-loop.js";
import { IngestionHandlerRegistry } from "./ingestion/ingestion-handler-registry.js";
import { noopEchoHandler } from "./handlers/noop-echo.handler.js";
import { processOrdersCreate } from "./channels/shopify/orders/orders-create.handler.js";
import { processOrdersUpdated } from "./channels/shopify/orders/orders-updated.handler.js";
import { processOrdersCancelled } from "./channels/shopify/orders/orders-cancelled.handler.js";
import { processFulfillmentOrderRoutingComplete } from "./channels/shopify/fulfillment/fulfillment-order-routing-complete.handler.js";
import { planShopifyFulfillment } from "./channels/shopify/fulfillment/shopify-fulfillment-plan.handler.js";
import { createShopifyFulfillment } from "./channels/shopify/fulfillment/shopify-fulfillment-create.handler.js";
import { processAppUninstalled } from "./channels/shopify/compliance/app-uninstalled.handler.js";
import { processShopRedact } from "./channels/shopify/compliance/shop-redact.handler.js";
import { processCustomersRedact } from "./channels/shopify/compliance/customers-redact.handler.js";
import { processCustomersDataRequest } from "./channels/shopify/compliance/customers-data-request.handler.js";
import { refreshShopifyToken } from "./channels/shopify/token/shopify-token-refresh.handler.js";
import { PiiRetentionScheduler } from "./schedulers/pii-retention.scheduler.js";
import { ShopifyTokenRefreshScheduler } from "./schedulers/shopify-token-refresh.scheduler.js";
import { InventoryReconcileScheduler } from "./core/inventory/inventory-reconcile.service.js";

export const OUTBOX_LOOP = Symbol("OUTBOX_LOOP");
export const INGESTION_LOOP = Symbol("INGESTION_LOOP");
export const PII_RETENTION_SCHEDULER = Symbol("PII_RETENTION_SCHEDULER");
export const TOKEN_REFRESH_SCHEDULER = Symbol("TOKEN_REFRESH_SCHEDULER");
export const INVENTORY_RECONCILE_SCHEDULER = Symbol("INVENTORY_RECONCILE_SCHEDULER");

@Module({
  providers: [
    { provide: IngestionHandlerRegistry, useFactory: () => new IngestionHandlerRegistry()
      .register("orders/create", (record) => processOrdersCreate(record.id))
      .register("orders/updated", (record) => processOrdersUpdated(record.id))
      .register("orders/cancelled", (record) => processOrdersCancelled(record.id))
      .register("fulfillment_orders/order_routing_complete", (record) => processFulfillmentOrderRoutingComplete(record.id))
      .register("app/uninstalled", (record) => processAppUninstalled(record.id))
      .register("shop/redact", (record) => processShopRedact(record.id))
      .register("customers/redact", (record) => processCustomersRedact(record.id))
      .register("customers/data_request", (record) => processCustomersDataRequest(record.id)),
    },
    { provide: HandlerRegistry, useFactory: () => new HandlerRegistry()
      .register("noop.echo", noopEchoHandler)
      .register("shopify.fulfillment.plan", planShopifyFulfillment)
      .register("shopify.fulfillment.create", createShopifyFulfillment)
      .register("shopify.token.refresh", refreshShopifyToken),
    },
    {
      provide: OUTBOX_LOOP,
      inject: [HandlerRegistry],
      useFactory: (registry: HandlerRegistry) =>
        new OutboxLoop(prisma, registry, { batchSize: 20, leaseSeconds: 60, maxAttempts: 8, pollMs: 1000 }),
    },
    {
      provide: INGESTION_LOOP,
      inject: [IngestionHandlerRegistry],
      useFactory: (registry: IngestionHandlerRegistry) =>
        new IngestionLoop(prisma, registry, { batchSize: 20, leaseSeconds: 60, maxAttempts: 8, pollMs: 1000 }),
    },
    { provide: PII_RETENTION_SCHEDULER, useFactory: () => new PiiRetentionScheduler(60 * 60_000) },
    // 10 minutes: the plan's own cadence for finding stores expiring within the 15-minute window.
    { provide: TOKEN_REFRESH_SCHEDULER, useFactory: () => new ShopifyTokenRefreshScheduler(10 * 60_000) },
    { provide: INVENTORY_RECONCILE_SCHEDULER, useFactory: () => new InventoryReconcileScheduler(15 * 60_000) },
  ],
  exports: [OUTBOX_LOOP, INGESTION_LOOP, PII_RETENTION_SCHEDULER, TOKEN_REFRESH_SCHEDULER, INVENTORY_RECONCILE_SCHEDULER],
})
export class WorkerModule {}
