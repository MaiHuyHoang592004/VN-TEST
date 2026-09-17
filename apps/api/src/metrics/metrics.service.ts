import type { PrismaClient } from "@fulfillflow/db";

export type OperationalMetrics = {
  pendingIngestionCount: number;
  oldestPendingIngestionAgeSeconds: number | null;
  pendingOutboxCount: number;
  oldestPendingOutboxAgeSeconds: number | null;
  openExceptionsByCode: Record<string, number>;
  reservationFailureCount: number;
  shopifySyncFailures: number;
  windowHours: number;
};

const RESERVATION_FAILURE_CODES = ["INSUFFICIENT_STOCK", "PRODUCTION_BLOCKED"] as const;

function ageSeconds(oldest: Date | undefined, now: Date): number | null {
  return oldest ? Math.max(0, Math.round((now.getTime() - oldest.getTime()) / 1000)) : null;
}

/** Cheap, always-fresh operational counters — not a time series, just "what does right now look like." */
export async function computeOperationalMetrics(prisma: PrismaClient, windowHours = 24, now = new Date()): Promise<OperationalMetrics> {
  const windowStart = new Date(now.getTime() - windowHours * 60 * 60_000);

  const [
    pendingIngestionCount, oldestPendingIngestion,
    pendingOutboxCount, oldestPendingOutbox,
    openExceptionGroups, reservationFailureCount, shopifySyncFailures,
  ] = await Promise.all([
    prisma.ingestionRecord.count({ where: { status: "PENDING" } }),
    prisma.ingestionRecord.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.outboxEvent.count({ where: { status: "PENDING" } }),
    prisma.outboxEvent.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.exceptionCase.groupBy({ by: ["code"], where: { status: "OPEN" }, _count: { code: true } }),
    prisma.exceptionCase.count({ where: { code: { in: [...RESERVATION_FAILURE_CODES] }, createdAt: { gte: windowStart } } }),
    prisma.deliveryAttempt.count({ where: { status: "FAILED", createdAt: { gte: windowStart } } }),
  ]);

  const openExceptionsByCode: Record<string, number> = {};
  for (const g of openExceptionGroups) openExceptionsByCode[g.code] = g._count.code;

  return {
    pendingIngestionCount,
    oldestPendingIngestionAgeSeconds: ageSeconds(oldestPendingIngestion?.createdAt, now),
    pendingOutboxCount,
    oldestPendingOutboxAgeSeconds: ageSeconds(oldestPendingOutbox?.createdAt, now),
    openExceptionsByCode,
    reservationFailureCount,
    shopifySyncFailures,
    windowHours,
  };
}
