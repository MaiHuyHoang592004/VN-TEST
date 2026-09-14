import { claimIngestion, completeIngestion, type PrismaClient } from "@fulfillflow/db";
import type { LoopOptions } from "../queue/outbox-loop.js";
import type { IngestionHandlerRegistry } from "./ingestion-handler-registry.js";

export class IngestionLoop {
  constructor(private readonly prisma: PrismaClient, private readonly registry: IngestionHandlerRegistry, private readonly opts: LoopOptions) {}

  async tick(): Promise<number> {
    const batch = await claimIngestion(this.prisma, { limit: this.opts.batchSize, leaseSeconds: this.opts.leaseSeconds });
    for (const record of batch) {
      const handler = this.registry.get(record.topic);
      if (!handler) throw new Error(`no handler registered: ${record.topic}`);
      await handler(record);
      await completeIngestion(this.prisma, record.id);
    }
    return batch.length;
  }
}
