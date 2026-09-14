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

export const OUTBOX_LOOP = Symbol("OUTBOX_LOOP");
export const INGESTION_LOOP = Symbol("INGESTION_LOOP");

@Module({
  providers: [
    { provide: IngestionHandlerRegistry, useFactory: () => new IngestionHandlerRegistry()
      .register("orders/create", (record) => processOrdersCreate(record.id))
      .register("orders/updated", (record) => processOrdersUpdated(record.id))
      .register("orders/cancelled", (record) => processOrdersCancelled(record.id))
      .register("fulfillment_orders/order_routing_complete", (record) => processFulfillmentOrderRoutingComplete(record.id)),
    },
    { provide: HandlerRegistry, useFactory: () => new HandlerRegistry()
      .register("noop.echo", noopEchoHandler)
      .register("shopify.fulfillment.plan", planShopifyFulfillment)
      .register("shopify.fulfillment.create", createShopifyFulfillment),
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
  ],
  exports: [OUTBOX_LOOP, INGESTION_LOOP],
})
export class WorkerModule {}
