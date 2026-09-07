import { notFound } from "next/navigation";

import { getOrderDetail } from "@/modules/fulfillment/orders/queries";
import { OrderDetail } from "@/components/pages/orders/order-detail";
import { orderShots } from "@/components/pages/orders/order-thumb";
import { toOrderRow } from "@/components/pages/orders/order-row";
import { Page } from "@/components/ds";

/**
 * One order, with room to correct it.
 *
 * An order the visitor may not see is a 404, not a 403 — the same rule as
 * tickets/[id]: telling someone "that exists but is not yours" already leaks
 * that it exists. `getOrderDetail` spreads orderScope into the query, so a
 * miss and a not-yours are the same miss, and this page only translates the
 * refusal.
 *
 * WHETHER it may be edited is decided there too, beside the read, and arrives
 * as `policy`. The page does not compute it: updateOrder decides again on
 * every save from the same table (editableAt, orders/status.ts), and a third
 * opinion in the browser could only ever be the wrong one.
 *
 * Sits beside orders/print. A static segment beats a dynamic one in Next's
 * router, so /orders/print keeps going to the print sheet rather than looking
 * up an order called "print".
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orderId = Number(id);
  // A non-numeric segment never reaches the database: findFirstOrThrow on NaN
  // is a 500 dressed up as a 404, and this is the honest version.
  if (!Number.isInteger(orderId) || orderId < 1) notFound();

  // null, never a throw: getOrderDetail keeps its permission guard OUTSIDE its
  // own catch, so a 403 still reaches the user as a 403 and only "no such
  // order, or not yours" arrives here.
  const detail = await getOrderDetail(orderId);
  if (!detail) notFound();

  const row = toOrderRow(detail.order);

  return (
    <Page className="max-w-6xl">
      <OrderDetail order={row} shots={orderShots(row)} policy={detail.policy} />
    </Page>
  );
}
