import { claimIngestion, type ClaimedIngestion, type PrismaClient } from "@fulfillflow/db";

export type IngestionClaimOptions = { batchSize: number; leaseSeconds: number; pollMs?: number };

/**
 * M2 scope: prove the worker can durably claim IngestionRecord rows written
 * by the webhook endpoint (SKIP LOCKED + lease, same primitive as the
 * outbox). It intentionally does nothing with a claimed row yet — normalizing
 * the Shopify payload into Order/OrderItem (or an ExceptionCase on failure)
 * is M2.5. A claimed-but-unhandled row is not stuck: its lease just expires
 * and `claimIngestion` picks it up again, so adding the real handler later
 * is additive, not a migration.
 */
export class IngestionClaimLoop {
  constructor(private readonly prisma: PrismaClient, private readonly opts: IngestionClaimOptions) {}

  async tick(): Promise<ClaimedIngestion[]> {
    return claimIngestion(this.prisma, { limit: this.opts.batchSize, leaseSeconds: this.opts.leaseSeconds });
  }

  /** Polls until the signal aborts. Mirrors OutboxLoop.run's shape for one consistent worker main.ts. */
  async run(signal: AbortSignal): Promise<void> {
    const pollMs = this.opts.pollMs ?? 1000;
    while (!signal.aborted) {
      let n = 0;
      try { n = (await this.tick()).length; } catch (err) { console.error(JSON.stringify({ msg: "ingestion claim tick failed", err: String(err) })); }
      if (n === 0) await new Promise<void>((r) => { const t = setTimeout(r, pollMs); signal.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true }); });
    }
  }
}
