import { claimOutbox, completeOutbox, failOutbox, type PrismaClient } from "@fulfillflow/db";
import type { HandlerRegistry } from "./handler-registry.js";

export type LoopOptions = { batchSize: number; leaseSeconds: number; maxAttempts: number; pollMs: number };

export class OutboxLoop {
  constructor(private readonly prisma: PrismaClient, private readonly registry: HandlerRegistry, private readonly opts: LoopOptions) {}

  /** Claims one batch, runs handlers, settles each row. Returns rows processed. */
  async tick(): Promise<number> {
    const batch = await claimOutbox(this.prisma, { limit: this.opts.batchSize, leaseSeconds: this.opts.leaseSeconds });
    for (const event of batch) {
      const handler = this.registry.get(event.handler);
      if (!handler) {
        await failOutbox(this.prisma, event.id, { error: `no handler registered: ${event.handler}`, maxAttempts: 0 });
        continue;
      }
      try {
        await handler(event);
        await completeOutbox(this.prisma, event.id);
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        await failOutbox(this.prisma, event.id, { error: message, maxAttempts: this.opts.maxAttempts });
      }
    }
    return batch.length;
  }

  /** Polls until the signal aborts. Sleeps pollMs only when a tick found nothing. */
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let n = 0;
      try { n = await this.tick(); } catch (err) { console.error(JSON.stringify({ msg: "outbox tick failed", err: String(err) })); }
      if (n === 0) await new Promise<void>((r) => { const t = setTimeout(r, this.opts.pollMs); signal.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true }); });
    }
  }
}
