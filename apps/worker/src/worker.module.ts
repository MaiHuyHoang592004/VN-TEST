import { Module } from "@nestjs/common";
import { prisma } from "@fulfillflow/db";
import { HandlerRegistry } from "./queue/handler-registry.js";
import { OutboxLoop } from "./queue/outbox-loop.js";
import { noopEchoHandler } from "./handlers/noop-echo.handler.js";

export const OUTBOX_LOOP = Symbol("OUTBOX_LOOP");

@Module({
  providers: [
    { provide: HandlerRegistry, useFactory: () => new HandlerRegistry().register("noop.echo", noopEchoHandler) },
    {
      provide: OUTBOX_LOOP,
      inject: [HandlerRegistry],
      useFactory: (registry: HandlerRegistry) =>
        new OutboxLoop(prisma, registry, { batchSize: 20, leaseSeconds: 60, maxAttempts: 8, pollMs: 1000 }),
    },
  ],
  exports: [OUTBOX_LOOP],
})
export class WorkerModule {}
