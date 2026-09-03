/**
 * Two leftovers from the legacy orders page: re-pricing an order that has not
 * been charged yet, and attaching the artwork by hand.
 *
 * Both are deliberately small. The design PIPELINE — per-order Google Drive
 * folders, BullMQ validation queues, PSD mockup composition, OCR label
 * extraction — is dead (doc 07 §0b); what people actually used it for was
 * "this order has the wrong picture on it, let me fix it", and that is a URL
 * or a file.
 */
import { prisma, writeAudit, orderScope, Prisma, type AuditContext } from "@opcreative/db";

import { assertImageBatch, storeImages } from "../../../core/storage.ts";
import { effectivePrice } from "../../../catalog/index.ts";
import { type Actor } from "./shared.ts";

export type ArtworkErrorCode =
  /** No order with that id inside the actor's scope. */
  | "not-found"
  /** The money has already moved — re-pricing would desync the ledger. */
  | "already-charged"
  /** A design/mockup edit on an order that has left PENDING. */
  | "not-editable"
  /** Neither a URL nor a file, or both at once. */
  | "nothing-to-set";

export class ArtworkError extends Error {
  readonly code: ArtworkErrorCode;
  readonly detail?: unknown;
  // Fields assigned explicitly, not via parameter properties: node --test
  // strips types rather than compiling them (modules/README.md).
  constructor(code: ArtworkErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "ArtworkError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Re-price orders against today's price list.
 *
 * ONLY orders that have not been charged. Legacy recalculated whatever it was
 * given, including orders whose money had already moved — the ledger then said
 * one number and the order said another, and nothing reconciled them. Here a
 * paid order is refused by name so the operator knows to refund instead.
 *
 * Prices come from catalog's effectivePrice, the same function the assignment
 * charge uses. Two pricing rules eventually disagree, and the one that
 * disagrees bills people.
 */
export async function recalcOrders(actor: Actor, ids: number[], ctx: AuditContext) {
  const orders = await prisma.order.findMany({
    where: { ...(await orderScope(actor)), id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      quantity: true,
      paid: true,
      status: true,
      baseCost: true,
      warehouse: { select: { tier: true } },
      productVariant: {
        select: { salePrice: true, prices: { select: { tier: true, price: true } } },
      },
    },
  });

  const charged = orders.filter((o) => o.paid || o.status !== "PENDING");
  const priceable = orders.filter((o) => !o.paid && o.status === "PENDING" && o.productVariant);
  const skippedNoSku = orders.length - charged.length - priceable.length;

  if (!priceable.length) {
    if (charged.length) {
      throw new ArtworkError("already-charged", "Those orders have already been charged.", {
        orderIds: charged.map((o) => o.id),
      });
    }
    return { ok: true as const, updated: 0, skipped: skippedNoSku, unchanged: 0 };
  }

  let updated = 0;
  let unchanged = 0;

  await prisma.$transaction(async (tx) => {
    for (const order of priceable) {
      const unit = effectivePrice(order.productVariant!, order.warehouse?.tier);
      const cost = unit.mul(order.quantity);
      const before = order.baseCost ?? new Prisma.Decimal(0);
      if (cost.equals(before)) {
        unchanged += 1;
        continue;
      }
      await tx.order.update({ where: { id: order.id }, data: { baseCost: cost } });
      await writeAudit(tx, ctx, {
        action: "ORDER_UPDATED",
        targetType: "order",
        targetId: String(order.id),
        before: { baseCost: before.toFixed(2) },
        after: { baseCost: cost.toFixed(2) },
        reason: "recalculated",
      });
      updated += 1;
    }
  });

  return {
    ok: true as const,
    updated,
    unchanged,
    skipped: skippedNoSku + charged.length,
    chargedSkipped: charged.map((o) => o.id),
  };
}

/**
 * Attach the design and/or the mockup to one order — a URL, or an uploaded
 * image, never both for the same slot.
 *
 * Editable while the order is still PENDING: once it is assigned, someone is
 * printing from what is attached now, and swapping the artwork under them is
 * how the wrong shirt gets made. Staff who may update any order are held to
 * the same rule, because the printer is downstream of both.
 */
export async function setOrderArtwork(
  actor: Actor,
  orderId: number,
  input: { designUrl?: string; mockupUrl?: string; mockupName?: string },
  files: { design?: File; mockup?: File },
  ctx: AuditContext,
) {
  // Truthiness, not `instanceof File`: the transport already proved the type
  // (actions.ts checks it against FormData), and re-checking the CLASS here
  // only made the rule untestable — a stand-in file silently became "no file"
  // and the caller got the wrong refusal.
  const uploads = [files.design, files.mockup].filter((f): f is File => Boolean(f));
  assertImageBatch(uploads);

  const order = await prisma.order.findFirst({
    where: { ...(await orderScope(actor)), id: orderId, deletedAt: null },
    select: { id: true, status: true, imageUrl: true, mockupId: true, externalId: true },
  });
  if (!order) throw new ArtworkError("not-found", "That order no longer exists.");
  if (order.status !== "PENDING") {
    throw new ArtworkError("not-editable", "This order is already in production.");
  }

  const design = input.designUrl?.trim();
  const mockup = input.mockupUrl?.trim();
  if (!design && !mockup && !uploads.length) {
    throw new ArtworkError("nothing-to-set", "Give a URL or choose a file.");
  }

  // Files first: a rejected upload must not leave half the change applied.
  const stored = uploads.length
    ? await storeImages(uploads, {
        prefix: `orders/${orderId}/`,
        uploadedById: actor.id,
      })
    : [];
  const storedDesign = files.design ? stored.shift() : undefined;
  const storedMockup = files.mockup ? stored.shift() : undefined;

  const designUrl = storedDesign?.url ?? design;
  const mockupUrl = storedMockup?.url ?? mockup;

  await prisma.$transaction(async (tx) => {
    let mockupId = order.mockupId;
    if (mockupUrl) {
      // One Mockup column per attachment, thumbnail = the image itself. No PSD
      // composition, no Drive folder — that pipeline is gone, and a mockup is
      // now just a picture with a name.
      const created = await tx.mockup.create({
        data: {
          name: input.mockupName?.trim() || order.externalId || `Order ${orderId}`,
          url: mockupUrl,
          thumbnail: mockupUrl,
        },
        select: { id: true },
      });
      mockupId = created.id;
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        ...(designUrl ? { imageUrl: designUrl } : {}),
        ...(mockupId !== order.mockupId ? { mockupId } : {}),
      },
    });
    await writeAudit(tx, ctx, {
      action: "ORDER_UPDATED",
      targetType: "order",
      targetId: String(orderId),
      before: { imageUrl: order.imageUrl, mockupId: order.mockupId },
      after: { imageUrl: designUrl ?? order.imageUrl, mockupId },
      reason: "artwork",
    });
  });

  return { ok: true as const, designUrl: designUrl ?? order.imageUrl };
}
