import { ConflictException, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { Prisma, type PrismaClient, type Shipment } from "@fulfillflow/db";
import { consumeForShipmentTx } from "@fulfillflow/core";

export const ShipFulfillmentBodySchema = z.object({
  items: z.array(z.object({ fulfillmentItemId: z.string().min(1), quantity: z.number().int().positive() })).min(1),
  carrier: z.string().min(1),
  trackingNumber: z.string().min(1),
  trackingUrl: z.string().url().optional(),
});
export type ShipFulfillmentBody = z.infer<typeof ShipFulfillmentBodySchema>;
export type ShipFulfillmentInput = ShipFulfillmentBody & { fulfillmentId: string };

const SHIPPABLE_STATUSES = new Set(["READY_TO_SHIP", "PARTIALLY_SHIPPED"]);

/**
 * Manual shipment creation (Task 16). One transaction: validate the guard
 * conditions, create Shipment + ShipmentItems, snapshot the address at ship
 * time, consume the FROM_STOCK reservation quantities this shipment covers
 * (consumeForShipmentTx — the same @fulfillflow/core logic the worker would
 * use, run inside THIS transaction because Prisma has no nested
 * transactions), update the Fulfillment to SHIPPED or PARTIALLY_SHIPPED, and
 * insert exactly one PENDING `shopify.fulfillment.plan` OutboxEvent. Any
 * failure — including the DB's own duplicate (provider, trackingNumber)
 * guard — rolls back everything in this list; nothing partial is ever left.
 */
export async function shipFulfillment(prisma: PrismaClient, input: ShipFulfillmentInput, actorId?: string): Promise<Shipment> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fulfillment" WHERE id = ${input.fulfillmentId} FOR UPDATE`;
      const fulfillment = await tx.fulfillment.findUnique({
        where: { id: input.fulfillmentId },
        include: { items: true, order: { include: { shippingAddress: true } } },
      });
      if (!fulfillment) throw new NotFoundException("fulfillment not found");
      if (!SHIPPABLE_STATUSES.has(fulfillment.status)) {
        throw new ConflictException(`cannot ship a fulfillment in status ${fulfillment.status}`);
      }
      const address = fulfillment.order.shippingAddress;
      if (!address || address.validationStatus !== "VALID") {
        throw new ConflictException("shipping address is missing or not VALID");
      }

      for (const line of input.items) {
        const item = fulfillment.items.find((i) => i.id === line.fulfillmentItemId);
        if (!item) throw new ConflictException(`fulfillment item ${line.fulfillmentItemId} does not belong to this fulfillment`);
        const shippedAgg = await tx.shipmentItem.aggregate({ where: { fulfillmentItemId: item.id }, _sum: { quantity: true } });
        const alreadyShipped = shippedAgg._sum.quantity ?? 0;
        if (alreadyShipped + line.quantity > item.quantity) {
          throw new ConflictException(`shipping ${line.quantity} more of item ${item.id} would exceed its ordered quantity of ${item.quantity}`);
        }
      }

      const shipment = await tx.shipment.create({ data: {
        fulfillmentId: input.fulfillmentId, provider: input.carrier,
        trackingNumber: input.trackingNumber, trackingUrl: input.trackingUrl,
        status: "IN_TRANSIT", shippedAt: new Date(),
        addressSnapshot: {
          name: address.name, company: address.company, line1: address.line1, line2: address.line2,
          city: address.city, province: address.province, postalCode: address.postalCode, countryCode: address.countryCode,
        },
      } });
      await tx.shipmentItem.createMany({ data: input.items.map((line) => ({
        shipmentId: shipment.id, fulfillmentId: input.fulfillmentId, fulfillmentItemId: line.fulfillmentItemId, quantity: line.quantity,
      })) });

      await consumeForShipmentTx(tx, input.fulfillmentId);

      const totals = await tx.shipmentItem.groupBy({ by: ["fulfillmentItemId"], where: { fulfillmentId: input.fulfillmentId }, _sum: { quantity: true } });
      const shippedByItem = new Map(totals.map((t) => [t.fulfillmentItemId, t._sum.quantity ?? 0]));
      const fullyShipped = fulfillment.items.every((item) => (shippedByItem.get(item.id) ?? 0) >= item.quantity);
      await tx.fulfillment.update({ where: { id: input.fulfillmentId }, data: {
        status: fullyShipped ? "SHIPPED" : "PARTIALLY_SHIPPED",
      } });

      await tx.outboxEvent.create({ data: {
        organizationId: fulfillment.order.organizationId, eventKey: `shipment.sync-plan:${shipment.id}`,
        aggregateType: "Shipment", aggregateId: shipment.id, handler: "shopify.fulfillment.plan",
        payload: { shipmentId: shipment.id },
      } });
      await tx.auditLog.create({ data: {
        organizationId: fulfillment.order.organizationId, actorId, action: "fulfillment.ship",
        entityType: "Shipment", entityId: shipment.id,
        after: { fulfillmentId: input.fulfillmentId, provider: shipment.provider, trackingNumber: shipment.trackingNumber },
      } });
      return shipment;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException("a shipment with this carrier and tracking number already exists");
    }
    throw error;
  }
}
