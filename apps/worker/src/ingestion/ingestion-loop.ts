import { claimIngestion, completeIngestion, failIngestion, type PrismaClient } from "@fulfillflow/db";
import { BusinessIngestionError } from "./ingestion-errors.js";
import type { LoopOptions } from "../queue/outbox-loop.js";
import type { IngestionHandlerRegistry } from "./ingestion-handler-registry.js";

export class IngestionLoop {
  constructor(private readonly prisma: PrismaClient, private readonly registry: IngestionHandlerRegistry, private readonly opts: LoopOptions) {}

  async tick(): Promise<number> {
    const batch = await claimIngestion(this.prisma, { limit: this.opts.batchSize, leaseSeconds: this.opts.leaseSeconds });
    for (const record of batch) {
      const handler = this.registry.get(record.topic);
      if (!handler) throw new Error(`no handler registered: ${record.topic}`);
      try {
        await handler(record);
        await completeIngestion(this.prisma, record.id);
      } catch (error) {
        await failIngestion(this.prisma, record.id, {
          error: error instanceof Error ? error.message : String(error),
          business: error instanceof BusinessIngestionError,
          code: error instanceof BusinessIngestionError ? error.code : undefined,
          maxAttempts: this.opts.maxAttempts,
        });
      }
    }
    return batch.length;
  }
}
