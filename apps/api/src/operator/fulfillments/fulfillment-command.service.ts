import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Fulfillment, PrismaClient, Prisma } from "@fulfillflow/db";
import { consumeForProduction } from "@fulfillflow/core";

async function loadWithOrg(prisma: Prisma.TransactionClient, fulfillmentId: string) {
  const fulfillment = await prisma.fulfillment.findUnique({
    where: { id: fulfillmentId },
    include: { order: { select: { organizationId: true } } },
  });
  if (!fulfillment) throw new NotFoundException("fulfillment not found");
  return fulfillment;
}

/** QUEUED + at least one ACTIVE reservation -> IN_PRODUCTION. Invalid transitions 409 without mutating anything. */
export async function startFulfillment(prisma: PrismaClient, fulfillmentId: string, actorId?: string, correlationId?: string): Promise<Fulfillment> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fulfillment" WHERE id = ${fulfillmentId} FOR UPDATE`;
    const fulfillment = await loadWithOrg(tx, fulfillmentId);
    if (fulfillment.status !== "QUEUED") throw new ConflictException(`cannot start a fulfillment in status ${fulfillment.status}`);
    const activeReservations = await tx.inventoryReservation.count({ where: { fulfillmentItem: { fulfillmentId }, status: "ACTIVE" } });
    if (activeReservations === 0) throw new ConflictException("fulfillment has no active inventory reservations");
    const updated = await tx.fulfillment.update({ where: { id: fulfillmentId }, data: { status: "IN_PRODUCTION", productionStartedAt: new Date() } });
    await tx.auditLog.create({ data: {
      organizationId: fulfillment.order.organizationId, actorId, correlationId, action: "fulfillment.start",
      entityType: "Fulfillment", entityId: fulfillmentId, before: { status: fulfillment.status }, after: { status: updated.status },
    } });
    return updated;
  });
}

/**
 * IN_PRODUCTION -> READY_TO_SHIP: consumes every MADE_TO_ORDER component
 * reservation in full (consumeForProduction is idempotent and lives in
 * @fulfillflow/core so it's the exact same logic the worker would use), sets
 * every FulfillmentItem's producedQuantity to its ordered quantity (V1 has
 * no partial-production concept), and only then flips the status — guarded
 * by a conditional update so two concurrent calls can't both "win".
 */
export async function completeProduction(prisma: PrismaClient, fulfillmentId: string, actorId?: string, correlationId?: string): Promise<Fulfillment> {
  const fulfillment = await loadWithOrg(prisma, fulfillmentId);
  if (fulfillment.status !== "IN_PRODUCTION") throw new ConflictException(`cannot complete production for a fulfillment in status ${fulfillment.status}`);
  await consumeForProduction(fulfillmentId);
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.fulfillment.updateMany({
      where: { id: fulfillmentId, status: "IN_PRODUCTION" },
      data: { status: "READY_TO_SHIP", productionCompletedAt: new Date() },
    });
    if (claimed.count !== 1) throw new ConflictException(`cannot complete production for a fulfillment in status ${fulfillment.status}`);
    await tx.$executeRaw`UPDATE "FulfillmentItem" SET "producedQuantity" = quantity WHERE "fulfillmentId" = ${fulfillmentId}`;
    const updated = await tx.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
    await tx.auditLog.create({ data: {
      organizationId: fulfillment.order.organizationId, actorId, correlationId, action: "fulfillment.complete-production",
      entityType: "Fulfillment", entityId: fulfillmentId, before: { status: "IN_PRODUCTION" }, after: { status: updated.status },
    } });
    return updated;
  });
}
