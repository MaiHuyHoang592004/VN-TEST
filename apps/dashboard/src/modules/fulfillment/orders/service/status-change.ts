/**
 * THE STATUS-CHANGE CORE.
 *
 * Everything that moves an order — the column menu, the scan stations, quick
 * scan, the handoff, the public API — goes through applyStatusChange inside
 * its own transaction. It exists as its own function because the alternative
 * is each caller restating the rules, and the one that forgets `resumeTo` or
 * the seller notification is the one nobody notices for a month.
 *
 * Legacy had no such notion: any screen could write any status over any other,
 * so an order could travel from DELIVERED back to PENDING and nothing recorded
 * that it had.
 */
import {
  prisma,
  writeAudit,
  orderScope,
  Prisma,
  type AuditContext,
  type FulfillmentStatus,
} from "@opcreative/db";

import { consumeForOrder, releaseForOrder } from "../../../inventory/index.ts";
import { dispatchWebhook, notify, notifyMany, usersWithPermission } from "../../../platform/index.ts";
import { InvalidTransitionError, canTransition } from "../status.ts";
import { resumeTargetOf, type Actor, type OrderConfigs } from "./shared.ts";

export type StatusSubject = {
  id: number;
  status: FulfillmentStatus;
  configs: Prisma.JsonValue | null;
  customerId: string | null;
  externalId: string | null;
};

/** What committed, so the caller can tell the seller's webhook AFTER the
 * transaction closes. An HTTP call inside $transaction holds column locks for as
 * long as the remote end takes to answer. */
export type StatusChange = {
  orderId: number;
  customerId: string | null;
  externalId: string | null;
  from: FulfillmentStatus;
  to: FulfillmentStatus;
  note?: string;
};

/**
 * THE status-change core: validate, write, audit, notify. Everything that
 * moves an order — the column menu, the scan stations, quick scan, the handoff —
 * goes through here inside its own transaction.
 *
 * It exists as its own function because the alternative is each caller
 * restating the rules, and the one that forgets `resumeTo` or the seller
 * notification is the one nobody notices for a month.
 */
export async function applyStatusChange(
  tx: Prisma.TransactionClient,
  ctx: AuditContext,
  order: StatusSubject,
  to: FulfillmentStatus,
  note?: string,
): Promise<StatusChange> {
  const resumeTo = resumeTargetOf(order.configs);
  if (!canTransition(order.status, to, resumeTo)) {
    throw new InvalidTransitionError(order.status, to);
  }

  // `configs` is a shared bag — the proof photo's storage key lives there too —
  // so it is rewritten ONLY when this transition actually changes it: setting
  // resumeTo on a hold, or clearing it on the way back. Writing the whole
  // object every time meant a caller that had just added a key in the SAME
  // transaction lost it, because the snapshot spread here predates their
  // update. Silent, and invisible until something reads the missing key.
  const touchesConfigs = to === "ON_HOLD" || resumeTo !== null;
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: to,
      ...(touchesConfigs
        ? {
            configs: {
              ...((order.configs as OrderConfigs | null) ?? {}),
              resumeTo: to === "ON_HOLD" ? order.status : undefined,
            },
          }
        : {}),
      ...(to === "FULFILLED" ? { fulfilledAt: new Date() } : {}),
    },
  });
  await writeAudit(tx, ctx, {
    action: "ORDER_STATUS_CHANGED",
    targetType: "order",
    targetId: String(order.id),
    before: { status: order.status },
    after: { status: to },
    reason: note ?? null,
  });

  // Stock follows the order, and it is hooked HERE rather than at each caller.
  // Every path that moves an order comes through this function — the scan
  // stations, quick scan, the column menu, the public API — so this is the one
  // place where "entering production consumes" and "cancelling gives back" can
  // be true for all of them at once. Wiring the scan station alone would have
  // left the column menu silently building orders out of stock it never took.
  //
  // Both are no-ops unless INVENTORY_ORDER_FLOW=1, and both are idempotent, so
  // a resumed hold or a re-scan does not consume twice.
  if (to === "IN_PRODUCTION") await consumeForOrder(tx, order.id, ctx.actor?.id);
  if (to === "CANCELLED") await releaseForOrder(tx, order.id, ctx.actor?.id);

  // The seller hears about OUTCOMES, not every internal step. A packer moving
  // an order through production is not news to the person who sold it, and a
  // bell that rings six times per order is a bell nobody reads.
  const worthTelling: FulfillmentStatus[] = ["SHIPPED", "DELIVERED", "CANCELLED", "ON_HOLD"];
  if (order.customerId && worthTelling.includes(to) && order.customerId !== ctx.actor?.id) {
    await notify(tx, {
      userId: order.customerId,
      type: "ORDER_STATUS_CHANGED",
      data: { externalId: order.externalId ?? String(order.id), status: to },
      href: "/orders",
    });
  }

  // ON_HOLD is the one status that needs a HUMAN, so it goes to whoever can
  // act on any order — admin and support — rather than to the seller alone.
  // The audience comes from the permission, so a new role that can see all
  // orders is included without editing this line.
  if (to === "ON_HOLD") {
    const watchers = (await usersWithPermission("orders.read.all")).filter(
      (u) => u !== ctx.actor?.id,
    );
    await notifyMany(tx, watchers, {
      type: "ORDER_ON_HOLD",
      data: { externalId: order.externalId ?? String(order.id), reason: note ?? "" },
      href: "/orders?tab=attention",
    });
  }

  return {
    orderId: order.id,
    customerId: order.customerId,
    externalId: order.externalId,
    from: order.status,
    to,
    note,
  };
}

/**
 * Which transitions a seller's integration hears about (legacy prod's
 * NOTIFIABLE_ORDER_STATUSES, translated through doc 05's status dictionary).
 * SHIPPED is absent on purpose: it arrives as `shipping_added` with the
 * tracking number, which is the event a shop actually needs.
 */
const WEBHOOK_STATUSES: FulfillmentStatus[] = ["IN_PRODUCTION", "FULFILLED", "ON_HOLD"];

/**
 * Tell the sellers. CALL AFTER THE TRANSACTION COMMITS — never inside one.
 *
 * Field names mirror legacy's payload so a shop's existing receiver keeps
 * working across the cutover without anyone editing their code.
 */
export async function dispatchStatusWebhooks(changes: StatusChange[]): Promise<void> {
  await Promise.all(
    changes
      .filter((c) => c.customerId && WEBHOOK_STATUSES.includes(c.to))
      .map((c) =>
        dispatchWebhook(c.customerId as string, "order_status", {
          id: c.orderId,
          order_id: c.externalId,
          status: c.to,
          note: c.note ?? null,
          updated_at: new Date().toISOString(),
        }),
      ),
  );
}

/**
 * Move ONE order along the map. The order is re-read through the actor's scope
 * first — a customer user must not be able to advance another site's order by
 * posting its id.
 */
export async function updateStatus(
  actor: Actor,
  id: number,
  to: FulfillmentStatus,
  ctx: AuditContext,
  note?: string,
) {
  const order = await prisma.order.findFirstOrThrow({
    where: { ...(await orderScope(actor)), id, deletedAt: null },
    select: { id: true, status: true, configs: true, customerId: true, externalId: true },
  });

  const change = await prisma.$transaction((tx) => applyStatusChange(tx, ctx, order, to, note));
  await dispatchStatusWebhooks([change]);
  return { ok: true as const };
}

