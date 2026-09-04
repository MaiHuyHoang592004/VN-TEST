/**
 * The orders table, as a spreadsheet.
 *
 * Two rules it exists to hold:
 *
 *  1. THE MONEY COLUMNS ARE A SERVER DECISION. Legacy pruned them per role in
 *     the browser, which means the numbers were in the payload either way —
 *     anyone who opened devtools had them. Here a caller without
 *     transactions.read.all never has base cost, fee, revenue or profit read
 *     out of the database at all.
 *  2. THE EXPORT IS THE FILTER. It runs the same scope and the same where
 *     clause the table just rendered, so "export what I am looking at" is
 *     literally true rather than approximately true.
 *
 * The result is a LINK, not a stream: a 50k-column workbook is megabytes, and a
 * Server Action response is the wrong pipe for that (the same reason the label
 * bundle returns a URL).
 */
import XLSX from "xlsx-js-style";
import { prisma, orderScope, can, Prisma, type FulfillmentStatus } from "@gwprint/db";

import { putObject } from "../../../core/storage.ts";
import { exportQuerySchema, type ExportQuery } from "../schema.ts";
import { type Actor } from "./shared.ts";
import { searchClauses } from "./reads.ts";

/**
 * ponytail: 50 000 rows in one function invocation. Ceiling — beyond that the
 * workbook build, not the query, is what runs out of memory. Upgrade path:
 * stream CSV instead of building a workbook, which is a different feature
 * (formatting is the reason people ask for xlsx).
 */
export const MAX_EXPORT_ROWS = 50_000;

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "111111" } },
  alignment: { horizontal: "left" as const },
};
const TITLE_STYLE = { font: { bold: true, sz: 14 } };

const date = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const money = (v: Prisma.Decimal | null | undefined) => (v ? Number(v.toFixed(2)) : 0);

/** The columns every exporter gets. Drive-era columns (folder id, design
 * status, mockup generation) are deliberately absent — that pipeline is dead
 * (doc 07 §0b) and exporting empty columns teaches people to expect it back. */
const BASE_COLUMNS = [
  "Order ID",
  "Marketplace",
  "Customer",
  "Product",
  "Variant",
  "SKU",
  "Quantity",
  "Filled",
  "Status",
  "Warehouse",
  "Placed",
  "Assigned",
  "Deadline",
  "Recipient",
  "Address",
  "City",
  "State",
  "Zip",
  "Country",
  "Tracking",
  "Carrier",
  "Label URL",
  "Proof URL",
  "Design URL",
  "Note",
] as const;

/** Added only for callers who may read the whole ledger. */
const MONEY_COLUMNS = ["Paid", "Base cost", "Fee", "Revenue", "Profit"] as const;

export async function exportOrders(actor: Actor, raw: ExportQuery = {}) {
  const query = exportQuerySchema.parse(raw);
  const withMoney = can(actor.roles, "transactions.read.all");

  const where: Prisma.OrderWhereInput = {
    ...(await orderScope(actor)),
    deletedAt: null,
    ...(query.status?.length ? { status: { in: query.status as FulfillmentStatus[] } } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.ids?.length ? { id: { in: query.ids } } : {}),
    ...(query.search ? { OR: searchClauses(query.search) } : {}),
  };

  const rows = await prisma.order.findMany({
    where,
    select: {
      id: true,
      externalId: true,
      marketplace: true,
      quantity: true,
      filled: true,
      status: true,
      placedAt: true,
      assignedAt: true,
      deadline: true,
      note: true,
      imageUrl: true,
      proofImageUrl: true,
      // The money half is SELECTED conditionally, so a customer user's export
      // never has these values in the process, let alone in the file.
      ...(withMoney
        ? { paid: true, baseCost: true, fee: true, revenue: true, profit: true }
        : {}),
      customer: { select: { name: true, email: true } },
      warehouse: { select: { code: true } },
      variant: { select: { name: true } },
      product: { select: { name: true } },
      productVariant: { select: { sku: true } },
      shippingAddress: {
        select: { name: true, line1: true, city: true, state: true, zip: true, country: true },
      },
      shipments: {
        select: { trackingNumber: true, provider: true, labelUrl: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { placedAt: "desc" },
    take: MAX_EXPORT_ROWS,
  });

  const total = await prisma.order.count({ where });
  const columns = withMoney ? [...BASE_COLUMNS, ...MONEY_COLUMNS] : [...BASE_COLUMNS];

  const filters = [
    query.search ? `search: ${query.search}` : null,
    query.status?.length ? `status: ${query.status.join(", ")}` : null,
    query.warehouseId ? `warehouse: ${query.warehouseId}` : null,
    query.ids?.length ? `selection: ${query.ids.length} order(s)` : null,
  ].filter(Boolean);

  // Title block first, exactly as the legacy sheet opened — the person who
  // receives the file needs to know what it is a export OF.
  const sheetRows: unknown[][] = [
    [{ v: "GWPrintz — orders export", s: TITLE_STYLE }],
    [`Exported ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`],
    [`Rows: ${rows.length}${total > rows.length ? ` of ${total} (capped)` : ""}`],
    [filters.length ? `Filters — ${filters.join(" · ")}` : "Filters — none (whole table)"],
    [],
    columns.map((c) => ({ v: c, s: HEADER_STYLE })),
  ];

  for (const order of rows) {
    const shipment = order.shipments[0];
    const line: unknown[] = [
      order.externalId ?? `#${order.id}`,
      order.marketplace ?? "",
      order.customer?.name ?? order.customer?.email ?? "",
      order.product?.name ?? "",
      order.variant?.name ?? "",
      order.productVariant?.sku ?? "",
      order.quantity,
      order.filled,
      order.status,
      order.warehouse?.code ?? "",
      date(order.placedAt),
      date(order.assignedAt),
      date(order.deadline),
      order.shippingAddress?.name ?? "",
      order.shippingAddress?.line1 ?? "",
      order.shippingAddress?.city ?? "",
      order.shippingAddress?.state ?? "",
      order.shippingAddress?.zip ?? "",
      order.shippingAddress?.country ?? "",
      shipment?.trackingNumber ?? "",
      shipment?.provider ?? "",
      shipment?.labelUrl ?? "",
      order.proofImageUrl ?? "",
      order.imageUrl ?? "",
      order.note ?? "",
    ];
    if (withMoney) {
      const paid = "paid" in order ? order.paid : false;
      line.push(
        paid ? "yes" : "no",
        money("baseCost" in order ? order.baseCost : null),
        money("fee" in order ? order.fee : null),
        money("revenue" in order ? order.revenue : null),
        money("profit" in order ? order.profit : null),
      );
    }
    sheetRows.push(line);
  }

  const sheet = XLSX.utils.aoa_to_sheet(sheetRows as never);
  sheet["!cols"] = columns.map((c) => ({ wch: Math.max(12, Math.min(28, c.length + 6)) }));
  // The header column stays visible while someone scrolls 50 000 rows.
  sheet["!freeze"] = { xSplit: "0", ySplit: "6" };

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Orders");
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const stamp = new Date().toISOString().slice(0, 10);
  const stored = await putObject({
    key: `exports/orders-export-${stamp}-${Date.now()}.xlsx`,
    body: buffer,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  return {
    ok: true as const,
    url: stored.url,
    filename: `orders-export-${stamp}.xlsx`,
    rows: rows.length,
    total,
    capped: total > rows.length,
    withMoney,
  };
}
