/**
 * GET /api/orders/<id>/thumb — the artwork thumbnail for one order.
 *
 * A safety net, not the hot path. Legacy `orders.image_url` is a Google Drive
 * FOLDER link rather than an image, so a thumbnail has to be resolved out of
 * that folder once; prisma/scripts/backfill-drive-mockups.ts does that for
 * every order already in the database, and the orders table then renders the
 * stored url straight from its own query without touching this route at all.
 *
 * What is left for this route is the order nobody has resolved yet — one
 * imported since the last backfill. It resolves, writes the answer to the
 * `mockups` table, and from that point the table renders it directly and this
 * route is never asked about that order again.
 *
 * It REDIRECTS rather than proxying the bytes: Drive already serves these over
 * its own CDN, and streaming megabytes through the app to re-serve them buys
 * nothing.
 */
import { orderArtwork } from "@/modules/fulfillment/orders/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return new Response("Not found", { status: 404 });
  }

  // Scoped inside: an order id in a URL proves nothing about who may see it.
  const artwork = await orderArtwork(orderId);

  // No artwork, or a folder we cannot read. 404 is the honest answer, and the
  // <img> that asked falls back to its placeholder.
  if (!artwork?.thumbnail) return new Response("Not found", { status: 404 });

  // A hand-built 307 rather than next/navigation's redirect(), which throws its
  // control-flow signal and leaves no way to set headers — and the header is
  // the point. `private`: this is one seller's artwork, so a shared cache must
  // never hold it. A day is plenty; a resolved thumbnail does not change, and
  // the row stops using this route entirely on the next page load anyway.
  return new Response(null, {
    status: 307,
    headers: {
      Location: artwork.thumbnail,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
