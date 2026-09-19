import type { ParsedRow, RowIssue, RowValues } from "@orderlane/core/import";
import { subtotalMinor } from "@orderlane/core/orders";

import type { TenantTx } from "@orderlane/db";

import type { Ctx } from "../../context.ts";
import { ValidationError } from "../../errors.ts";
import type { PersistedImportAdapter } from "../adapter.ts";
import { parsePriceMinor } from "./catalog.ts";

/**
 * Order import: one row is one LINE, and rows sharing an order reference
 * become one order with several lines.
 *
 * This is the shape marketplace exports actually have, and handling it is the
 * point — an importer that could only make single-line orders would quietly
 * turn one three-item order into three orders, which is wrong in the customer's
 * inbox and wrong in the shipping cost.
 *
 * Each LINE still hashes independently, so a merchant correcting one quantity
 * and re-uploading the file updates that line and leaves its siblings alone.
 */

export interface OrderRow extends RowValues {
  readonly externalRef: string;
  readonly channel: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPriceMinor: number | null;
  readonly buyerName: string;
  readonly shipLine1: string;
  readonly shipCity: string;
  readonly shipCountry: string;
}

export const ordersAdapter: PersistedImportAdapter<OrderRow> = {
  kind: "ORDERS",
  columns: ["order_ref", "channel", "sku", "quantity", "unit_price", "buyer_name", "ship_line1", "ship_city", "ship_country"],

  /**
   * The line's identity, which deliberately includes the order reference and
   * the SKU but NOT the buyer or address: correcting a misspelled street
   * should update the order, not look like a different line.
   */
  hashFields: ["externalRef", "sku", "quantity", "unitPriceMinor"],

  identityOf: (values) => `${values.externalRef}::${values.sku}`,

  parse(raw, lineNumber): ParsedRow<OrderRow> {
    const issues: RowIssue[] = [];

    const externalRef = String(raw["order_ref"] ?? "").trim();
    const channel = String(raw["channel"] ?? "").trim() || "import";
    const sku = String(raw["sku"] ?? "").trim().toUpperCase();
    const quantityRaw = raw["quantity"];
    const quantity = Number(typeof quantityRaw === "string" ? quantityRaw.trim() : quantityRaw);
    const unitPriceMinor = raw["unit_price"] === undefined || String(raw["unit_price"] ?? "").trim() === ""
      ? null
      : parsePriceMinor(raw["unit_price"]);
    const buyerName = String(raw["buyer_name"] ?? "").trim();
    const shipLine1 = String(raw["ship_line1"] ?? "").trim();
    const shipCity = String(raw["ship_city"] ?? "").trim();
    const shipCountry = String(raw["ship_country"] ?? "").trim().toUpperCase();

    if (!externalRef) issues.push({ field: "order_ref", code: "required", message: "an order reference is required" });
    if (!sku) issues.push({ field: "sku", code: "required", message: "a SKU is required" });
    if (!Number.isInteger(quantity) || quantity < 1) {
      issues.push({ field: "quantity", code: "invalid_quantity", message: `"${String(quantityRaw ?? "")}" is not a positive whole number` });
    }
    if (raw["unit_price"] !== undefined && String(raw["unit_price"] ?? "").trim() !== "" && unitPriceMinor === null) {
      issues.push({ field: "unit_price", code: "invalid_price", message: `"${String(raw["unit_price"])}" is not a price` });
    }
    if (!buyerName) issues.push({ field: "buyer_name", code: "required", message: "a buyer name is required" });
    if (!shipLine1) issues.push({ field: "ship_line1", code: "required", message: "a shipping address is required" });
    if (!shipCity) issues.push({ field: "ship_city", code: "required", message: "a shipping city is required" });
    if (shipCountry.length !== 2) {
      issues.push({ field: "ship_country", code: "invalid_country", message: "country must be a two-letter code" });
    }

    if (issues.length > 0) return { lineNumber, raw, issues };
    return {
      lineNumber,
      raw,
      issues: [],
      values: { externalRef, channel, sku, quantity, unitPriceMinor, buyerName, shipLine1, shipCity, shipCountry },
    };
  },

  async apply(tx: TenantTx, ctx: Ctx, values: OrderRow): Promise<string> {
    const variant = await tx.variant.findUnique({
      where: { tenantId_sku: { tenantId: ctx.tenantId, sku: values.sku } },
      select: { id: true, title: true, priceMinor: true },
    });
    // Validated at staging time, but re-checked here: the catalogue can move
    // between preview and commit, and a preview is a forecast.
    if (!variant) {
      throw new ValidationError(`SKU "${values.sku}" is no longer in the catalogue`, [
        { field: "sku", code: "unknown_sku", sku: values.sku },
      ]);
    }

    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: ctx.tenantId },
      select: { currency: true },
    });

    let order = await tx.order.findFirst({
      where: { externalRef: values.externalRef },
      include: { lines: true },
    });

    if (!order) {
      const count = await tx.order.count();
      order = await tx.order.create({
        data: {
          tenantId: ctx.tenantId,
          number: `ORD-${String(count + 1).padStart(5, "0")}`,
          channel: values.channel,
          externalRef: values.externalRef,
          buyer: { name: values.buyerName },
          shipTo: {
            name: values.buyerName,
            line1: values.shipLine1,
            city: values.shipCity,
            country: values.shipCountry,
          },
          currency: tenant.currency,
          subtotalMinor: 0,
          shippingMinor: 0,
          totalMinor: 0,
          placedAt: new Date(),
        },
        include: { lines: true },
      });
    }

    const unitPriceMinor = values.unitPriceMinor ?? variant.priceMinor;
    const existingLine = order.lines.find((l) => l.sku === values.sku);

    const line = existingLine
      ? await tx.orderLine.update({
          where: { id: existingLine.id },
          data: { quantity: values.quantity, unitPriceMinor },
        })
      : await tx.orderLine.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: order.id,
            variantId: variant.id,
            sku: values.sku,
            title: variant.title,
            quantity: values.quantity,
            unitPriceMinor,
          },
        });

    // Totals are recomputed from the lines that now exist, never adjusted by a
    // delta: a delta is only right if every previous delta was.
    const lines = await tx.orderLine.findMany({
      where: { orderId: order.id },
      select: { quantity: true, unitPriceMinor: true },
    });
    const subtotal = subtotalMinor(lines);
    await tx.order.update({
      where: { id: order.id },
      data: { subtotalMinor: subtotal, totalMinor: subtotal + order.shippingMinor },
    });

    return line.id;
  },
};
