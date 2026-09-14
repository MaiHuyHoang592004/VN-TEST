import { z } from "zod";

const id = z.union([z.string().regex(/^\d+$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String);
const text = z.string().nullish();
const timestamp = z.string().datetime({ offset: true });
export const shopifyOrderSchema = z.object({
  id,
  admin_graphql_api_id: z.string().regex(/^gid:\/\/shopify\/Order\/\d+$/).optional(),
  name: text, created_at: timestamp, updated_at: timestamp,
  financial_status: z.string(), currency: z.string().regex(/^[A-Z]{3}$/),
  email: text,
  shipping_address: z.object({
    name: text, first_name: text, last_name: text, company: text, phone: text,
    address1: text, address2: text, city: text, province: text, zip: text, country_code: text,
  }).nullish(),
  line_items: z.array(z.object({
    id, admin_graphql_api_id: z.string().regex(/^gid:\/\/shopify\/LineItem\/\d+$/).optional(),
    variant_id: id.nullish(), sku: text, title: z.string(), quantity: z.number().int().positive(),
    properties: z.array(z.object({ name: z.string(), value: z.string().nullable() })).nullish(),
  })).min(1).refine((items) => new Set(items.map((item) => item.id)).size === items.length, "duplicate line ids"),
});
