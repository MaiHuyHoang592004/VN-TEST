import { claimIngestion, completeIngestion, failIngestion, type PrismaClient } from "@fulfillflow/db";
import { BusinessIngestionError } from "./ingestion-errors.js";
import type { LoopOptions } from "../queue/outbox-loop.js";
import type { IngestionHandlerRegistry } from "./ingestion-handler-registry.js";

export class IngestionLoop {
  constructor(private readonly prisma: PrismaClient, private readonly registry: IngestionHandlerRegistry, private readonly opts: LoopOptions) {}

  async tick(): Promise<number> {
    const batch = await claimIngestion(this.prisma, { limit: this.opts.batchSize, leaseSeconds: this.opts.leaseSeconds });
    for (const record of batch) {
      try {
        const handler = this.registry.get(record.topic);
        // An unregistered topic is a permanent condition — waiting and
        // retrying never makes a handler appear — so it settles EXCEPTION
        // immediately via the same BusinessIngestionError path below, one
        // row at a time, instead of throwing out of the batch loop and
        // stranding the rest of this tick's rows until their lease expires.
        if (!handler) throw new BusinessIngestionError("UNKNOWN_TOPIC", `no handler registered for topic: ${record.topic}`);
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

  /** Drain the claimed batch on shutdown; interrupt only idle polling. */
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let n = 0;
      try { n = await this.tick(); }
      catch (error) { console.error(JSON.stringify({ msg: "ingestion tick failed", err: String(error) })); }
      if (n === 0 && !signal.aborted) await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, this.opts.pollMs);
        signal.addEventListener("abort", done, { once: true });
        if (signal.aborted) done();
      });
    }
  }
}
