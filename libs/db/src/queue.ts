/**
 * Postgres-native job queue primitives. One transaction per claim:
 *   SELECT … FOR UPDATE SKIP LOCKED  →  UPDATE lease  →  RETURNING rows.
 * A crashed worker never leaves a stuck row: the lease (availableAt / lockedUntil)
 * simply expires and the row is claimable again. No PROCESSING status exists.
 */
import { Prisma, type PrismaClient } from "./generated/prisma/client.ts";

export type ClaimOptions = { limit: number; leaseSeconds: number };
export type ClaimedOutbox = {
  id: string; handler: string; payload: unknown; attempts: number; aggregateType: string; aggregateId: string;
};
export type ClaimedIngestion = { id: string; topic: string; storeId: string; organizationId: string; attempts: number };

export async function claimOutbox(prisma: PrismaClient, { limit, leaseSeconds }: ClaimOptions): Promise<ClaimedOutbox[]> {
  return prisma.$queryRaw<ClaimedOutbox[]>`
    WITH picked AS (
      SELECT id FROM "OutboxEvent"
      WHERE status = 'PENDING' AND "availableAt" <= now()
      ORDER BY "availableAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "OutboxEvent" o
    SET "availableAt" = now() + make_interval(secs => ${leaseSeconds}), attempts = attempts + 1
    FROM picked WHERE o.id = picked.id
    RETURNING o.id, o.handler, o.payload, o.attempts, o."aggregateType", o."aggregateId"`;
}

export async function completeOutbox(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.outboxEvent.update({ where: { id }, data: { status: "SENT", processedAt: new Date() } });
}

export function backoffSeconds(attempts: number): number {
  return Math.min(2 ** attempts * 30, 30 * 60);
}

export async function failOutbox(
  prisma: PrismaClient, id: string, { error, maxAttempts }: { error: string; maxAttempts: number },
): Promise<"retry" | "dead"> {
  const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id }, select: { attempts: true } });
  const message = error.slice(0, 2000);
  if (row.attempts >= maxAttempts) {
    await prisma.outboxEvent.update({ where: { id }, data: { status: "DEAD_LETTER", lastError: message } });
    return "dead";
  }
  await prisma.outboxEvent.update({
    where: { id },
    data: { lastError: message, availableAt: new Date(Date.now() + backoffSeconds(row.attempts) * 1000) },
  });
  return "retry";
}

export async function claimIngestion(prisma: PrismaClient, { limit, leaseSeconds }: ClaimOptions): Promise<ClaimedIngestion[]> {
  return prisma.$queryRaw<ClaimedIngestion[]>`
    WITH picked AS (
      SELECT id FROM "IngestionRecord"
      WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
        AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
      ORDER BY "nextAttemptAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "IngestionRecord" r
    SET "lockedUntil" = now() + make_interval(secs => ${leaseSeconds}), attempts = attempts + 1
    FROM picked WHERE r.id = picked.id
    RETURNING r.id, r.topic, r."storeId", r."organizationId", r.attempts`;
}

export { Prisma };
