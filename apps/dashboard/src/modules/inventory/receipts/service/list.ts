/**
 * Reads behind the Receipts tab: the list, one receipt in full, and the report
 * the tiles are built from.
 */
import { prisma, Prisma } from "@opcreative/db";

import { InventoryError, readableSites, siteWhere, type Actor } from "../../stock/service.ts";
import { reportSchema } from "../schema.ts";

export type ReceiptFilter = {
  search?: string;
  status?: "PENDING" | "PARTIAL" | "COMPLETE" | "REJECTED";
  itemType?: "MATERIAL" | "PRODUCT";
  warehouseId?: number;
  page?: number;
  pageSize?: number;
};

export async function listReceipts(actor: Actor, filter: ReceiptFilter = {}) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
  const sites = await readableSites(actor, filter.warehouseId);
  const like = filter.search ? { contains: filter.search, mode: "insensitive" as const } : undefined;

  const where: Prisma.StockReceiptWhereInput = {
    ...siteWhere(sites),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.itemType ? { itemType: filter.itemType } : {}),
    // Keyword covers the two things someone actually has in hand: the receipt
    // code off the paperwork, or a tracking number off the parcel.
    ...(like
      ? {
          OR: [
            { code: like },
            { provider: like },
            { shipments: { some: { trackingNumber: like } } },
            { shipments: { some: { vendor: { name: like } } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.stockReceipt.findMany({
      where,
      select: {
        id: true,
        code: true,
        itemType: true,
        status: true,
        provider: true,
        createdAt: true,
        customer: { select: { id: true, name: true } },
        shipments: { select: { vendor: { select: { name: true } } } },
        _count: { select: { shipments: true, lines: true } },
      },
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.stockReceipt.count({ where }),
  ]);

  return {
    total,
    rows: rows.map(({ shipments, _count, ...r }) => ({
      ...r,
      // Distinct vendor names across the shipments, falling back to the typed
      // provider — a receipt can be split across two materials.
      supplier:
        [...new Set(shipments.map((s) => s.vendor?.name).filter((n) => n != null))].join(", ") ||
        r.provider,
      shipmentCount: _count.shipments,
      lineCount: _count.lines,
    })),
  };
}

export async function getReceipt(actor: Actor, id: number) {
  const sites = await readableSites(actor);
  const receipt = await prisma.stockReceipt.findFirst({
    where: { id, ...siteWhere(sites) },
    select: {
      id: true,
      code: true,
      itemType: true,
      status: true,
      provider: true,
      note: true,
      rejectReason: true,
      createdAt: true,
      approvedAt: true,
      customer: { select: { id: true, name: true } },
      createdBy: { select: { name: true, email: true } },
      approvedBy: { select: { name: true, email: true } },
      shipments: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          shipmentCode: true,
          status: true,
          trackingNumber: true,
          trackingUrl: true,
          carrier: true,
          expectedArrivalAt: true,
          receivedAt: true,
          note: true,
          evidence: true,
          vendor: { select: { id: true, name: true } },
          lines: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              requestedQuantity: true,
              receivedQuantity: true,
              rejectedQuantity: true,
              unitPrice: true,
              note: true,
              material: { select: { id: true, sku: true, name: true, uom: true } },
              productVariant: {
                select: {
                  id: true,
                  sku: true,
                  variant: { select: { name: true } },
                  product: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!receipt) throw new InventoryError("not-found", "That receipt no longer exists.");
  return receipt;
}

/**
 * The four tiles above the Receipts table.
 *
 * Variance is COMPUTED here and never stored (legacy rule): received +
 * rejected − requested per line, non-zero listed. Storing it would be a third
 * number that has to be kept in step with the two it is derived from.
 */
export async function shipmentsReport(actor: Actor, raw: unknown = {}) {
  const input = reportSchema.parse(raw);
  const sites = await readableSites(actor, input.warehouseId);
  const scope = siteWhere(sites);

  const now = new Date();
  const horizon = new Date(now.getTime() + input.upcomingDays * 24 * 60 * 60 * 1000);
  // Only shipments still in flight can be "upcoming" or "overdue": one that
  // has landed is not late however long it took.
  const inFlight: Prisma.StockReceiptShipmentWhereInput = {
    status: { in: ["PENDING", "PARTIAL_RECEIVED"] },
    receipt: { ...scope, status: { in: ["PENDING", "PARTIAL"] } },
  };

  const [upcomingEta, overdueEta, partialReceipts, varianceLines] = await Promise.all([
    prisma.stockReceiptShipment.count({
      where: { ...inFlight, expectedArrivalAt: { gte: now, lte: horizon } },
    }),
    prisma.stockReceiptShipment.count({
      where: { ...inFlight, expectedArrivalAt: { lt: now } },
    }),
    prisma.stockReceipt.count({ where: { ...scope, status: "PARTIAL" } }),
    // Only settled lines can have a variance: an untouched line is not "short",
    // it simply has not arrived yet.
    prisma.stockReceiptLine.findMany({
      where: { receipt: scope, receivedQuantity: { not: null } },
      select: {
        id: true,
        requestedQuantity: true,
        receivedQuantity: true,
        rejectedQuantity: true,
        receipt: { select: { id: true, code: true } },
        material: { select: { sku: true, name: true } },
        productVariant: { select: { sku: true, variant: { select: { name: true } } } },
      },
      take: 500,
    }),
  ]);

  const quantityVariances = varianceLines
    .map((l) => ({
      lineId: l.id,
      receiptId: l.receipt.id,
      code: l.receipt.code,
      sku: l.material?.sku ?? l.productVariant?.sku ?? null,
      name: l.material?.name ?? l.productVariant?.variant.name ?? null,
      requested: l.requestedQuantity,
      received: l.receivedQuantity ?? 0,
      rejected: l.rejectedQuantity,
      variance: (l.receivedQuantity ?? 0) + l.rejectedQuantity - l.requestedQuantity,
    }))
    .filter((v) => v.variance !== 0);

  return { upcomingEta, overdueEta, partialReceipts, quantityVariances };
}
