import { Module } from "@nestjs/common";
import { prisma } from "@fulfillflow/db";
import { HandlerRegistry } from "./queue/handler-registry.js";
import { OutboxLoop } from "./queue/outbox-loop.js";
import { IngestionClaimLoop } from "./queue/ingestion-claim-loop.js";
import { noopEchoHandler } from "./handlers/noop-echo.handler.js";

export const OUTBOX_LOOP = Symbol("OUTBOX_LOOP");
export const INGESTION_CLAIM_LOOP = Symbol("INGESTION_CLAIM_LOOP");

@Module({
  providers: [
    { provide: HandlerRegistry, useFactory: () => new HandlerRegistry().register("noop.echo", noopEchoHandler) },
    {
      provide: OUTBOX_LOOP,
      inject: [HandlerRegistry],
      useFactory: (registry: HandlerRegistry) =>
        new OutboxLoop(prisma, registry, { batchSize: 20, leaseSeconds: 60, maxAttempts: 8, pollMs: 1000 }),
    },
    {
      provide: INGESTION_CLAIM_LOOP,
      // M2 scope only: claims IngestionRecord rows so nothing goes unclaimed
      // forever. M2.5 replaces the no-op tick() body with real normalization.
      useFactory: () => new IngestionClaimLoop(prisma, { batchSize: 20, leaseSeconds: 60 }),
    },
  ],
  exports: [OUTBOX_LOOP, INGESTION_CLAIM_LOOP],
})
export class WorkerModule {}
