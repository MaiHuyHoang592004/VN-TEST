import "server-only";

import { parseDriveUrl } from "@gwprint/shared";

import type { OrderRow } from "@/components/pages/orders/orders-table";

/**
 * The Drive FOLDER an order's design lives in, or null.
 *
 * Deliberately narrower than `parseDriveUrl`, which also recognises a Drive
 * FILE link: a file is already something an <img> can render, and calling it a
 * folder would send the row down the resolve path for a picture it already has.
 */
const driveFolderId = (url: string | null): string | null => {
  const ref = parseDriveUrl(url);
  return ref?.kind === "folder" ? ref.id : null;
};

/**
 * One Prisma order → the row shape the table and the detail page both render.
 *
 * Lifted out of the list page the day /orders/[id] needed the same shape.
 * Fifty field mappings copied into a second file is the kind of duplication
 * that does not announce itself when it drifts — the copy simply stops
 * carrying a field, and one screen quietly shows a blank where the other shows
 * a phone number. The artwork fields especially: `mockupFolderId`,
 * `mockupStatus` and `designFolderId` are three halves of one decision
 * (designSlot in order-thumb.tsx), and a screen holding two of them draws the
 * wrong thumbnail rather than none.
 *
 * Two conversions are the whole reason this is not a spread:
 *   Decimal → string, because a float loses cents on the way to the client;
 *   Date → ISO string, because a Date does not survive the server/client
 *   boundary as a Date.
 */
export function toOrderRow(o: OrderInput): OrderRow {
  return {
id: o.id,
externalId: o.externalId,
marketplace: o.marketplace,
status: o.status,
quantity: o.quantity,
filled: o.filled,
paid: o.paid,
// Money as a string: Decimal doesn't cross the boundary and a float
// would lose cents.
baseCost: o.baseCost?.toFixed(2) ?? null,
placedAt: o.placedAt.toISOString(),
deadline: o.deadline?.toISOString() ?? null,
customerName: o.customer?.name ?? o.customer?.email ?? null,
// The IDs behind the two names, so the Seller and Site cells can
// filter to them. Both were already in ORDER_LIST_SELECT — the row
// simply never carried them, and a display name is not something a
// query can be narrowed by.
customerId: o.customer?.id ?? null,
warehouseCode: o.warehouse?.code ?? null,
warehouseId: o.warehouse?.id ?? null,
productName: o.product?.name ?? null,
variantName: o.variant?.name ?? null,
sku: o.productVariant?.sku ?? null,
// The row carries two DIFFERENT pictures, and the shapes differ:
//   imageUrl        — the DESIGN, a Drive FOLDER (489/489 rows)
//   mockup.thumbnail— the MOCKUP, an image endpoint (425/425 rows,
//                     drive.google.com/thumbnail?id=…)
// Verified against the live database. A folder is not an image, so
// only the second of these may ever reach an <img>; the first is a
// link. That is the whole reason this column used to render a broken
// glyph on every row.
//
// The three fields under them are what let the row stop drawing a
// folder icon for EVERY design. `folderId` says which folder the
// mockup was resolved out of, `status` remembers a folder already
// tried and found unreadable, and `designFolderId` is the design's
// own folder id — equal to the first means the design and the mockup
// are literally the same picture and the row draws it once.
//
// Parsed HERE and not in the browser so the client never re-derives
// it per render; parseDriveUrl is pure, so it costs a regex per row.
// Running `npm run db:backfill:mockups` from libs/db resolves every
// folder in bulk and turns the whole table into the merged case.
mockupThumbnail: o.mockup?.thumbnail ?? null,
mockupFolderId: o.mockup?.folderId ?? null,
mockupStatus: o.mockup?.status ?? null,
// FOLDER only. parseDriveUrl also recognises a Drive FILE link, and
// one of those is already something an <img> can be pointed at — it
// must not be mistaken for a container to resolve.
designFolderId: driveFolderId(o.imageUrl),
imageUrl: o.imageUrl,
proofImageUrl: o.proofImageUrl,
shipmentId: o.shipments[0]?.id ?? null,
labelVoided: Boolean(o.shipments[0]?.voidedAt),
tracking: o.shipments[0]?.trackingNumber ?? null,
shipTo: [
  o.shippingAddress?.city,
  o.shippingAddress?.state,
  o.shippingAddress?.zip,
  o.shippingAddress?.country,
]
  .filter(Boolean)
  .join(", ") || null,
trackingStatus: o.shipments[0]?.trackingStatus ?? null,
carrier: o.shipments[0]?.provider ?? null,
service: o.shipments[0]?.method ?? null,
labelUrl: o.shipments[0]?.labelUrl ?? null,
// Decimal → string at the boundary, same as baseCost: a float would
// lose cents on the way to the client.
shipCost: o.shipments[0]?.cost?.toFixed(2) ?? null,
note: o.note,
internalNote: o.internalNote,
updatedAt: o.updatedAt.toISOString(),
productVariantId: o.productVariant?.id ?? null,
shippingName: o.shippingAddress?.name ?? null,
shippingCompany: o.shippingAddress?.company ?? null,
shippingEmail: o.shippingAddress?.email ?? null,
shippingPhone: o.shippingAddress?.phone ?? null,
line1: o.shippingAddress?.line1 ?? null,
line2: o.shippingAddress?.line2 ?? null,
city: o.shippingAddress?.city ?? null,
state: o.shippingAddress?.state ?? null,
zip: o.shippingAddress?.zip ?? null,
country: o.shippingAddress?.country ?? null,
  };
}

/**
 * Structurally whatever ORDER_LIST_SELECT selects — read off `listOrders`
 * rather than hand-written, so adding a column to that select does not need a
 * second declaration here.
 *
 * The LIST row on purpose, not getOrder's: getOrder selects the same columns
 * plus `configs`, so a detail order satisfies this type while the reverse
 * would not, and one mapper has to accept both callers.
 */
type OrderInput =
  Awaited<
    ReturnType<typeof import("@/modules/fulfillment/orders/queries").listOrders>
  >["rows"][number];
