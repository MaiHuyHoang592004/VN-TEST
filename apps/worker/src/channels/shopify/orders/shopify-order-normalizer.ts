import { shopifyOrderSchema } from "./shopify-order.schema.js";
import { BusinessIngestionError } from "../../../ingestion/ingestion-errors.js";

const clean = (value: string | null | undefined) => value?.trim() || null;
export function normalizeShopifyOrder(raw: unknown) {
  const parsed = shopifyOrderSchema.safeParse(raw);
  if (!parsed.success) throw new BusinessIngestionError("INVALID_PAYLOAD", "Invalid Shopify order payload");
  const order = parsed.data;
  const address = order.shipping_address;
  return {
    externalId: order.admin_graphql_api_id ?? `gid://shopify/Order/${order.id}`,
    displayNumber: clean(order.name),
    placedAt: new Date(order.created_at).toISOString(),
    channelUpdatedAt: new Date(order.updated_at).toISOString(),
    cancelledAt: order.cancelled_at ? new Date(order.cancelled_at).toISOString() : null,
    channelFinancialStatus: order.financial_status, currency: order.currency,
    customerEmail: clean(order.email),
    address: {
      name: clean(address?.name) ?? clean([address?.first_name, address?.last_name].filter(Boolean).join(" ")),
      company: clean(address?.company), email: clean(order.email), phone: clean(address?.phone),
      line1: clean(address?.address1), line2: clean(address?.address2), city: clean(address?.city),
      province: clean(address?.province), postalCode: clean(address?.zip), countryCode: clean(address?.country_code)?.toUpperCase() ?? null,
    },
    items: order.line_items.map((line) => ({
      externalLineId: line.admin_graphql_api_id ?? `gid://shopify/LineItem/${line.id}`,
      externalVariantId: line.variant_id ? `gid://shopify/ProductVariant/${line.variant_id}` : null,
      externalSku: clean(line.sku), title: line.title, quantity: line.quantity,
      customization: Object.fromEntries((line.properties ?? []).map((p) => [p.name, p.value])),
    })),
  };
}
export type NormalizedShopifyOrder = ReturnType<typeof normalizeShopifyOrder>;
export type NormalizedAddress = NormalizedShopifyOrder["address"];
