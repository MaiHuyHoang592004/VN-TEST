/**
 * Raising a receipt, and editing one nobody has received against yet.
 *
 * A receipt is a PLAN: this is what we ordered, arriving in these shipments.
 * Nothing here touches stock — booking in happens in receive.ts, against
 * whatever physically shows up, which is routinely not what was ordered.
 */
import { prisma, writeAudit, Prisma, type AuditContext } from "@opcreative/db";

import { InventoryError, assertSite, type Actor } from "../../stock/service.ts";
import { createReceiptSchema } from "../schema.ts";

/**
 * "SR-20260722-K3M9Q". ONE series for both item types, replacing legacy's
 * MSR-/PSR- split — the old codes survive the cutover and stay unique
 * alongside these, because the prefix differs.
 *
 * Random rather than sequential on purpose: a guessable receipt number leaks
 * how much the business buys, and a counter needs a lock this does not.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function receiptCode(now: Date): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `SR-${stamp}-${suffix}`;
}

const blankToNull = (v?: string) => (v && v.length ? v : null);
const dateOrNull = (v?: string) => (v && v.length ? new Date(v) : null);

type ParsedInput = ReturnType<typeof createReceiptSchema.parse>;

/**
 * Everything the input names must exist BEFORE anything is written.
 *
 * Checking up front rather than letting foreign keys fail means the floor sees
 * "that material was deleted" instead of a constraint name, and a half-built
 * receipt never exists even for the length of a transaction.
 */
async function assertReferencesExist(input: ParsedInput) {
  const customer = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new InventoryError("not-found", "That customer no longer exists.");

  const vendorIds = [...new Set(input.shipments.map((s) => s.vendorId).filter((v) => v != null))];
  if (vendorIds.length) {
    const found = await prisma.vendor.count({
      where: { id: { in: vendorIds }, deletedAt: null },
    });
    if (found !== vendorIds.length) {
      throw new InventoryError("not-found", "One of those vendors no longer exists.");
    }
  }

  const lines = input.shipments.flatMap((s) => s.lines);
  const materialIds = [...new Set(lines.map((l) => l.materialId).filter((v) => v != null))];
  const variantIds = [...new Set(lines.map((l) => l.productVariantId).filter((v) => v != null))];

  // A MATERIAL receipt whose lines point at variant variants would pass the
  // per-line XOR and still be nonsense, so the discriminator is checked too.
  const wrongType =
    input.itemType === "MATERIAL" ? variantIds.length > 0 : materialIds.length > 0;
  if (wrongType) {
    throw new InventoryError("item-not-found", "A line does not match the receipt's item type.");
  }

  if (materialIds.length) {
    const found = await prisma.material.count({
      where: { id: { in: materialIds }, deletedAt: null },
    });
    if (found !== materialIds.length) {
      throw new InventoryError("item-not-found", "One of those suppliers no longer exists.");
    }
  }
  if (variantIds.length) {
    const found = await prisma.productVariant.count({
      where: { id: { in: variantIds }, deletedAt: null },
    });
    if (found !== variantIds.length) {
      throw new InventoryError("item-not-found", "One of those SKUs no longer exists.");
    }
  }
}

/** Shipments and their lines, shaped for a nested create. */
function shipmentData(input: ParsedInput, receiptId: number) {
  return input.shipments.map((s, index) => ({
    receiptId,
    vendorId: s.vendorId ?? null,
    shipmentCode: blankToNull(s.shipmentCode) ?? `S${index + 1}`,
    trackingNumber: blankToNull(s.trackingNumber),
    carrier: blankToNull(s.carrier),
    trackingUrl: blankToNull(s.trackingUrl),
    expectedArrivalAt: dateOrNull(s.expectedArrivalAt),
    note: blankToNull(s.note),
  }));
}

export async function createReceipt(actor: Actor, raw: unknown, ctx: AuditContext) {
  const input = createReceiptSchema.parse(raw);
  await assertSite(actor, input.warehouseId);
  await assertReferencesExist(input);

  const created = await prisma.$transaction(async (tx) => {
    const receipt = await tx.stockReceipt.create({
      data: {
        code: receiptCode(new Date()),
        itemType: input.itemType,
        warehouseId: input.warehouseId,
        provider: blankToNull(input.provider),
        note: blankToNull(input.note),
        createdById: actor.id,
      },
      select: { id: true, code: true },
    });

    // Shipments first, then lines — a line needs its shipment's id, and the
    // rows are created in input order so "S1" is the first one typed.
    const shipments = await Promise.all(
      shipmentData(input, receipt.id).map((data) =>
        tx.stockReceiptShipment.create({ data, select: { id: true } }),
      ),
    );

    await tx.stockReceiptLine.createMany({
      data: input.shipments.flatMap((s, index) =>
        s.lines.map((l) => ({
          receiptId: receipt.id,
          shipmentId: shipments[index]!.id,
          materialId: l.materialId ?? null,
          productVariantId: l.productVariantId ?? null,
          requestedQuantity: l.requestedQuantity,
          unitPrice: l.unitPrice != null ? new Prisma.Decimal(l.unitPrice) : null,
          note: blankToNull(l.note),
        })),
      ),
    });

    await writeAudit(tx, ctx, {
      action: "RECEIPT_CREATED",
      targetType: "receipt",
      targetId: String(receipt.id),
      after: {
        code: receipt.code,
        itemType: input.itemType,
        warehouseId: input.warehouseId,
        shipments: input.shipments.length,
        lines: input.shipments.reduce((n, s) => n + s.lines.length, 0),
      },
    });

    return receipt;
  });

  return { ok: true as const, id: created.id, code: created.code };
}

/**
 * Rewrite a receipt that is still entirely a plan.
 *
 * Wipe-and-recreate of shipments and lines, which is legacy's semantics and
 * the simplest correct thing while nothing has been received: there are no
 * quantities to preserve and no movements pointing at these line ids yet. The
 * moment anything IS received the receipt leaves PENDING and this refuses —
 * otherwise an edit could delete the line a stock movement was booked against.
 */
export async function updateReceipt(
  actor: Actor,
  receiptId: number,
  raw: unknown,
  ctx: AuditContext,
) {
  const input = createReceiptSchema.parse(raw);
  const existing = await prisma.stockReceipt.findUnique({
    where: { id: receiptId },
    select: { id: true, status: true, warehouseId: true, code: true },
  });
  if (!existing) throw new InventoryError("not-found", "That receipt no longer exists.");

  // Both sites: the one it is in now, and the one it is being moved to.
  await assertSite(actor, existing.warehouseId);
  await assertSite(actor, input.warehouseId);

  if (existing.status !== "PENDING") {
    throw new InventoryError(
      "not-editable",
      "This receipt has already been received against and can no longer be edited.",
      { status: existing.status },
    );
  }
  await assertReferencesExist(input);

  await prisma.$transaction(async (tx) => {
    // Lines first: they reference shipments, and cascade would take them
    // anyway — deleting them explicitly keeps the order obvious to a reader.
    await tx.stockReceiptLine.deleteMany({ where: { receiptId } });
    await tx.stockReceiptShipment.deleteMany({ where: { receiptId } });

    await tx.stockReceipt.update({
      where: { id: receiptId },
      data: {
        itemType: input.itemType,
        warehouseId: input.warehouseId,
        provider: blankToNull(input.provider),
        note: blankToNull(input.note),
      },
    });

    const shipments = await Promise.all(
      shipmentData(input, receiptId).map((data) =>
        tx.stockReceiptShipment.create({ data, select: { id: true } }),
      ),
    );
    await tx.stockReceiptLine.createMany({
      data: input.shipments.flatMap((s, index) =>
        s.lines.map((l) => ({
          receiptId,
          shipmentId: shipments[index]!.id,
          materialId: l.materialId ?? null,
          productVariantId: l.productVariantId ?? null,
          requestedQuantity: l.requestedQuantity,
          unitPrice: l.unitPrice != null ? new Prisma.Decimal(l.unitPrice) : null,
          note: blankToNull(l.note),
        })),
      ),
    });

    await writeAudit(tx, ctx, {
      action: "RECEIPT_CREATED",
      targetType: "receipt",
      targetId: String(receiptId),
      after: { code: existing.code, edited: true, shipments: input.shipments.length },
    });
  });

  return { ok: true as const };
}
