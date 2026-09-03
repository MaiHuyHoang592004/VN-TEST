import { z } from "zod";

/**
 * ONE schema, used by the form, the server action, the spreadsheet importer
 * and /api/v1. A field that is editable in the UI but dropped on save was a
 * real legacy bug; the importer reusing it is what makes "column 4 is invalid"
 * mean the same thing as "the form would have rejected it".
 */
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const orderSchema = z.object({
  /** The marketplace's own order id. Not unique — one external order can split
   * into several rows — but required, because it is how support finds anything. */
  externalId: z.string().trim().min(1, "An order id is required").max(120),
  marketplace: optionalText(64),
  seller: optionalText(120),

  /** The SKU. variant/product are copied from it server-side, never taken from
   * the client, so a forged pair cannot price an order wrongly. */
  productVariantId: z.number().int().positive("Choose a variant and product"),
  mockupId: z.number().int().positive().optional().nullable(),

  quantity: z.number().int().min(1, "At least one").max(10_000),
  /**
   * When the marketplace took the order. Optional, defaulting to now: legacy
   * overwrote whatever was sent with `new Date()`, so every integration is
   * already used to omitting it — and demanding it produced a validation
   * message ("expected date, received Date") that means nothing to a human.
   * Senders who know the real marketplace timestamp may still pass it.
   */
  placedAt: z.coerce.date().optional().default(() => new Date()),
  deadline: z.coerce.date().optional().nullable(),

  shippingName: z.string().trim().min(1, "A recipient name is required").max(200),
  shippingEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  shippingPhone: optionalText(40),
  shippingCompany: optionalText(200),
  line1: optionalText(200),
  line2: optionalText(200),
  city: optionalText(120),
  state: optionalText(120),
  /** Required: legacy made it required too, and a parcel without one is a
   * support ticket rather than a shipment. */
  zip: z.string().trim().min(1, "A postcode is required").max(20),
  country: optionalText(120),

  note: optionalText(2000),
  internalNote: optionalText(2000),
  imageUrl: z.string().trim().url("Enter a valid URL").max(1000).optional().or(z.literal("")),
});

export type OrderInput = z.infer<typeof orderSchema>;

/** A batch from the spreadsheet importer. Capped so one paste cannot hold a
 * transaction open across tens of thousands of rows. */
export const orderBatchSchema = z.array(orderSchema).min(1).max(500);

export const assignSchema = z.object({
  orderIds: z.array(z.number().int().positive()).min(1, "Select at least one order"),
  warehouseId: z.number().int().positive("Choose a customer"),
  /** Supplied by the CLIENT and reused verbatim on retry — that is what makes
   * a double-clicked Assign charge exactly once. */
  idempotencyKey: z.string().trim().min(8).max(200),
});

/**
 * The table filter, as the export receives it from a client.
 *
 * listOrders takes a plain type because its callers are server components that
 * built the object themselves; the export arrives from the browser, so it gets
 * parsed at the boundary like everything else.
 */
export const exportQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.array(z.string()).optional(),
  warehouseId: z.number().int().positive().optional(),
  customerId: z.string().trim().optional(),
  ids: z.array(z.number().int().positive()).max(50_000).optional(),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
