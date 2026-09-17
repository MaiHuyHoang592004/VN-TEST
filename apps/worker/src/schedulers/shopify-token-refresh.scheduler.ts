/**
 * Every tick, finds ACTIVE Shopify stores whose access token expires within
 * REFRESH_WINDOW_MS and enqueues exactly one `shopify.token.refresh` outbox
 * event per store/tokenVersion — the eventKey embeds tokenVersion, so a
 * store already queued for its current token is never queued twice. Once
 * `ShopifyTokenManager.refresh()` rotates the token, tokenVersion changes
 * and the next window's eventKey is fresh again.
 */
import { prisma, type PrismaClient } from "@fulfillflow/db";

const REFRESH_WINDOW_MS = 15 * 60_000;

function isUniqueConstraintViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}

export async function enqueueExpiringTokenRefreshes(db: PrismaClient = prisma, now: Date = new Date()): Promise<number> {
  const stores = await db.store.findMany({
    where: {
      status: "ACTIVE",
      refreshTokenEnc: { not: null },
      accessTokenExpiresAt: { not: null, lte: new Date(now.getTime() + REFRESH_WINDOW_MS) },
    },
    select: { id: true, organizationId: true, tokenVersion: true },
  });

  let enqueued = 0;
  for (const store of stores) {
    try {
      await db.outboxEvent.create({ data: {
        organizationId: store.organizationId,
        eventKey: `shopify.token.refresh:${store.id}:${store.tokenVersion}`,
        aggregateType: "Store", aggregateId: store.id,
        handler: "shopify.token.refresh", payload: { storeId: store.id },
      } });
      enqueued++;
    } catch (err) {
      // Already queued for this tokenVersion — not an error, just a no-op.
      if (!isUniqueConstraintViolation(err)) throw err;
    }
  }
  return enqueued;
}

export class ShopifyTokenRefreshScheduler {
  constructor(private readonly pollMs: number, private readonly now: () => Date = () => new Date()) {}

  async tick(): Promise<number> {
    return enqueueExpiringTokenRefreshes(prisma, this.now());
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try { await this.tick(); } catch (err) { console.error(JSON.stringify({ msg: "token refresh scheduler tick failed", err: String(err) })); }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.pollMs);
        signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
  }
}
