import { requirePermission } from "@/modules/core/guard";
import { listOrders } from "@/modules/fulfillment/orders/queries";
import { PrintLabelsSheet } from "@/components/pages/orders/print-labels-sheet";

/**
 * The printable QR sheet — one block per order, opened in its own tab and
 * printed on load.
 *
 * A PAGE, not an endpoint. Legacy had a server route that rendered barcodes
 * into a PDF and streamed it back; a browser already has a print engine and a
 * canvas, so the whole thing is a route with print CSS and nothing to cache,
 * version or clean up. The QR encodes the order id — the same value the scan
 * station's Order ID mode reads, which is what closes the loop between the
 * paper on a box and the bench that scans it.
 *
 * Guarded on orders.status.update: whoever prints these works them.
 */
export default async function PrintOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("orders.status.update");
  const sp = await searchParams;
  const raw = Array.isArray(sp.ids) ? sp.ids[0] : sp.ids;
  const ids = (raw ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0)
    .slice(0, 200);

  // Read through the SAME scoped query the table uses. An id in a URL is not
  // permission to print someone else's order: `ids` narrows the scope, so an
  // id outside it resolves to nothing rather than to a column.
  const { rows: orders } = ids.length
    ? await listOrders({ ids, pageSize: 200 })
    : { rows: [] };

  return (
    <PrintLabelsSheet
      orders={orders.map((o) => ({
        id: o.id,
        externalId: o.externalId,
        productName: o.variant?.name ?? null,
        variantName: o.product?.name ?? null,
        sku: o.productVariant?.sku ?? null,
        quantity: o.quantity,
        tracking: o.shipments[0]?.trackingNumber ?? null,
        customerName: o.warehouse?.name ?? o.warehouse?.email ?? null,
        warehouseCode: o.customer?.code ?? null,
      }))}
    />
  );
}
