/**
 * Drops raw Shopify webhook payloads once they are no longer needed for
 * reprocessing or support — 30 days after ingestion. Normalized operational
 * data (Order/OrderItem/etc, already derived from the payload at ingest
 * time) is untouched; only the freeform captured JSON and its purge marker
 * change. Mirrors the same purge shape `shop/redact` uses.
 */
import { prisma, Prisma } from "@fulfillflow/db";

const RETENTION_MS = 30 * 24 * 60 * 60_000;

export async function purgeExpiredIngestionPayloads(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const result = await prisma.ingestionRecord.updateMany({
    where: { createdAt: { lt: cutoff }, purgedAt: null },
    data: { rawPayload: Prisma.DbNull, purgedAt: now },
  });
  return result.count;
}

export class PiiRetentionScheduler {
  constructor(private readonly pollMs: number, private readonly now: () => Date = () => new Date()) {}

  async tick(): Promise<number> {
    return purgeExpiredIngestionPayloads(this.now());
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try { await this.tick(); } catch (err) { console.error(JSON.stringify({ msg: "pii retention tick failed", err: String(err) })); }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.pollMs);
        signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
  }
}
