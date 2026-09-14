import { Prisma, type IngestionRecord } from "@fulfillflow/db";
import type { NormalizedShopifyOrder } from "./shopify-order-normalizer.js";
import { validateAddressCompleteness } from "./address-completeness.validator.js";
import { withOrderRecord } from "./order-record-transaction.js";
import { routeAndReserve } from "../../../core/routing/route-and-reserve.js";

/** Returned by createNormalizedOrder only when a new canonical Order was just created, so the caller can route it. */
export type OrderAccepted = { orderId: string };

export async function processOrdersCreate(recordId: string): Promise<void> {
  const accepted = await withOrderRecord(recordId, createNormalizedOrder);
  if (accepted) await routeAndReserve(accepted.orderId);
}

export async function createNormalizedOrder(tx: Prisma.TransactionClient, record: IngestionRecord, normalized: NormalizedShopifyOrder): Promise<OrderAccepted | undefined> {
    const existing = await tx.order.findUnique({ where: { storeId_externalId: { storeId: record.storeId, externalId: normalized.externalId } } });
    if (existing) {
      await tx.ingestionRecord.update({ where: { id: record.id }, data: {
        status: "DUPLICATE", normalizedPayload: normalized, resultOrderId: existing.id,
        processedAt: new Date(), lockedUntil: null, errorCode: null, errorMessage: null,
      } });
      return undefined;
    }
    if (normalized.channelFinancialStatus !== "paid") {
      await tx.ingestionRecord.update({ where: { id: record.id }, data: {
        status: "HELD", normalizedPayload: normalized, processedAt: new Date(), lockedUntil: null,
        errorCode: null, errorMessage: null,
      } });
      return undefined;
    }
    const mappings = await tx.storeSkuMapping.findMany({ where: { storeId: record.storeId } });
    const unmapped = normalized.items.filter((line) => !mappings.some((m) => m.externalVariantId === line.externalVariantId));
    if (unmapped.length) {
      const message = "One or more Shopify variants have no SKU mapping";
      await tx.exceptionCase.create({ data: {
        organizationId: record.organizationId, ingestionRecordId: record.id,
        subjectKey: `ingestion:${record.id}`, code: "SKU_NOT_MAPPED", visibility: "MERCHANT",
        message, details: { lines: unmapped },
      } });
      await tx.ingestionRecord.update({ where: { id: record.id }, data: {
        status: "EXCEPTION", normalizedPayload: normalized, processedAt: new Date(), lockedUntil: null,
        errorCode: "SKU_NOT_MAPPED", errorMessage: message,
      } });
      return undefined;
    }
    const items = normalized.items.map((line) => {
      const mapping = mappings.find((m) => m.externalVariantId === line.externalVariantId);
      if (!mapping) throw new Error("unmapped variant");
      return {
        skuId: mapping.skuId, externalLineId: line.externalLineId, externalSku: line.externalSku,
        title: line.title, quantity: line.quantity, artworkUrl: mapping.defaultArtworkUrl,
        customization: { ...(mapping.defaultCustomization as Record<string, Prisma.InputJsonValue> ?? {}), ...line.customization },
      };
    });
    const validation = validateAddressCompleteness(normalized.address);
    const order = await tx.order.create({ data: {
      organizationId: record.organizationId, storeId: record.storeId,
      externalId: normalized.externalId, sourceKey: `shopify:${record.storeId}:${normalized.externalId}`,
      displayNumber: normalized.displayNumber, currency: normalized.currency,
      channelFinancialStatus: normalized.channelFinancialStatus, channelUpdatedAt: normalized.channelUpdatedAt,
      placedAt: normalized.placedAt, customerName: normalized.address.name, customerEmail: normalized.customerEmail,
      shippingAddress: { create: {
        ...normalized.address, ...validation,
        countryCode: validation.validationErrors.countryCode ? null : normalized.address.countryCode,
      } },
      items: { create: items },
    } });
    if (validation.validationStatus === "INVALID") {
      await tx.exceptionCase.create({ data: {
        organizationId: record.organizationId, orderId: order.id, ingestionRecordId: record.id,
        subjectKey: `order:${order.id}`, code: "INVALID_ADDRESS", visibility: "MERCHANT",
        message: "Shipping address is incomplete or invalid", details: validation.validationErrors,
      } });
    }
    await tx.ingestionRecord.update({ where: { id: record.id }, data: {
      status: "ACCEPTED", normalizedPayload: normalized, resultOrderId: order.id,
      processedAt: new Date(), lockedUntil: null, errorCode: null, errorMessage: null,
    } });
    return { orderId: order.id };
}
