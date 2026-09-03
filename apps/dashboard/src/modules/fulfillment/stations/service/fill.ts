/**
 * Filling — recording that pieces of an order are made, and claiming the shelf
 * slot a multi-order parcel accumulates in.
 *
 * "Filled" is deliberately NOT a status: it is `filled >= quantity`, derived
 * from a counter. Legacy carried both a counter and a Filled status, and they
 * disagreed on any order anyone edited.
 */
import { prisma, writeAudit, orderScope, type AuditContext } from "@opcreative/db";

import { notifyMany, usersWithPermission, warehouseMemberIds } from "../../../platform/index.ts";
import { StationError } from "./errors.ts";
import { basketName, rowsFor, toGroup, type Actor, type TrackingGroup } from "./group.ts";
import { fillSchema } from "../schema.ts";

export async function fillOrder(
  actor: Actor,
  raw: unknown,
  ctx: AuditContext,
): Promise<{ group: TrackingGroup; basket: { name: string } | null }> {
  const { orderId, amount } = fillSchema.parse(raw);
  const scope = await orderScope(actor);

  const order = await prisma.order.findFirst({
    where: { ...scope, id: orderId, deletedAt: null },
    select: { id: true, status: true, warehouseId: true, customer: { select: { code: true } } },
  });
  if (!order) throw new StationError("group-not-found", "No such order here.");
  if (order.status !== "IN_PRODUCTION") {
    throw new StationError("not-in-production", "Scan the parcel before filling it.");
  }

  const group = await rowsFor(actor, { orderId });
  const tracking = group.map((r) => r.shipments[0]?.trackingNumber).find(Boolean) ?? null;

  const groupIds = group.map((r) => r.id);
  const claimed = await withBlockedAlert(order, ctx, () => prisma.$transaction(async (tx) => {
    // Lock the WHOLE parcel first, ascending by id (a fixed order is what
    // stops two stations deadlocking each other). Two packers filling two
    // different pieces of the same parcel at the same moment would otherwise
    // both read "no basket yet" and claim one each: the group ends up with two
    // slots occupied, one of them orphaned and never freed. Serialising here
    // means the second transaction re-reads AFTER the first committed and
    // sees the slot it already has.
    const locked = await tx.$queryRaw<Array<{ id: number; basket_position_id: number | null }>>`
      SELECT id, basket_position_id FROM orders
      WHERE id = ANY(${groupIds}::int[])
      ORDER BY id
      FOR UPDATE
    `;

    // The counter moves in SQL, guarded by the column's own quantity. Reading
    // `filled`, adding in JS and writing it back is the legacy assignment bug
    // in miniature: two packers filling one order at the same moment both read
    // 0, both write 1, and a parcel ships half empty.
    const moved = await tx.$executeRaw`
      UPDATE orders SET filled = filled + ${amount}, updated_at = now()
      WHERE id = ${orderId} AND filled + ${amount} <= quantity
    `;
    if (moved === 0) {
      throw new StationError("amount-exceeds-remaining", "That is more than is left to fill.");
    }

    // A multi-order parcel needs somewhere physical to accumulate until every
    // piece is made. One slot per parcel, claimed on the first fill.
    if (locked.length > 1 && !locked.some((r) => r.basket_position_id)) {
      // FOR UPDATE SKIP LOCKED: two stations filling two DIFFERENT parcels at
      // the same moment must not be handed the same shelf slot. Plain FOR
      // UPDATE would make the second wait on the first's column and then take it
      // anyway once released; SKIP LOCKED is what makes it look at the next
      // free slot instead.
      const [slot] = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM basket_positions
        WHERE status = 'AVAILABLE'
        ORDER BY id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      if (!slot) {
        // Nobody at the bench can fix this — every slot is full, and the fix
        // is someone clearing shelves. Tell the people who can, once, and let
        // the transaction roll back around the notification: a "the floor is
        // blocked" bell for a fill that then succeeded would be worse noise
        // than silence, and the packer sees the banner either way.
        throw new StationError(
          "no-available-basket",
          "No basket position is free — empty one before continuing.",
        );
      }
      await tx.basketPosition.update({
        where: { id: slot.id },
        data: { status: "OCCUPIED", trackingNumber: tracking },
      });
      await tx.order.updateMany({
        where: { id: { in: groupIds } },
        data: { basketPositionId: slot.id },
      });
      await writeAudit(tx, ctx, {
        action: "ORDER_UPDATED",
        targetType: "order",
        targetId: groupIds.join(","),
        after: { basketPositionId: slot.id },
      });
      const position = await tx.basketPosition.findUniqueOrThrow({
        where: { id: slot.id },
        select: { name: true, shelfName: true, column: true, row: true },
      });
      return basketName(position);
    }
    return null;
  }));

  const refreshed = toGroup(await rowsFor(actor, { orderId }), new Set());
  return { group: refreshed, basket: claimed ?? refreshed.basket };
}

/**
 * Raise "the floor is blocked" when a fill fails for want of a shelf slot.
 *
 * AFTER the transaction rolls back, never inside it: a notification written in
 * the same transaction as the failure would roll back with it, and one written
 * before the failure would announce a blockage for a fill that then succeeded.
 * The packer already sees a banner — this is for the people who can actually
 * clear shelves, and it names the site so a multi-site admin knows where to go.
 */
async function withBlockedAlert<T>(
  order: { warehouseId: number | null; customer: { code: string } | null },
  ctx: AuditContext,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof StationError && e.code === "no-available-basket") {
      const site = order.customer?.code ?? "the customer";
      const staff = order.warehouseId ? await warehouseMemberIds(order.warehouseId) : [];
      const admins = await usersWithPermission("orders.read.all");
      await notifyMany(prisma, [...staff, ...admins].filter((id) => id !== ctx.actor?.id), {
        type: "FULFILLMENT_BLOCKED",
        data: { customer: site, reason: "No basket position is free" },
        href: "/fulfillment",
      });
    }
    throw e;
  }
}
