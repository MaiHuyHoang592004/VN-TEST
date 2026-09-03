/**
 * GET /api/v1/catalog
 *
 * Replaces TWO legacy endpoints at once: GET /api/warehouse/metadata (what can
 * I order?) and GET /api/v3/warehouse/orders/pricing (what does it cost me?).
 * They were separate, so an integration had to join them client-side and every
 * one of them did it slightly differently.
 *
 * Prices are THIS CALLER'S — effectivePrice against the key owner's tier, the
 * same function the assignment charge uses. A price list that differs from
 * what you are billed is worse than no price list.
 */
import { prisma, productScope } from "@opcreative/db";
import { effectivePrice } from "@/modules/catalog";
import { withApiKey, money } from "../_lib/with-api-key.ts";

export const dynamic = "force-dynamic";

/** Cursor paging, like /orders: a catalogue that grows under a walker must not
 * shift rows between pages. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const GET = withApiKey(async (req, actor) => {
  const url = new URL(req.url);
  const cursor = Number(url.searchParams.get("cursor")) || undefined;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));

  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { tier: true },
  });

  const products = await prisma.product.findMany({
    where: {
      // The allow-list a restricted seller is bound to — same clause the
      // catalogue page spreads, so the API cannot show more than the UI.
      ...(await productScope(actor)),
      deletedAt: null,
      status: "ACTIVE",
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    select: {
      id: true,
      name: true,
      key: true,
      thumbnail: true,
      variants: {
        where: { deletedAt: null },
        select: {
          id: true,
          sku: true,
          status: true,
          salePrice: true,
          prices: { select: { tier: true, price: true } },
          product: { select: { id: true, name: true, key: true } },
        },
      },
    },
    orderBy: { id: "asc" },
    take: limit,
  });

  const data = products.map((product) => ({
    id: product.id,
    name: product.name,
    key: product.key,
    thumbnail: product.thumbnail,
    skus: product.variants.map((sku) => ({
      // `id` is what POST /orders wants as product_variant_id.
      id: sku.id,
      code: sku.sku,
      status: sku.status,
      product: sku.product && { id: sku.product.id, name: sku.product.name, key: sku.product.key },
      // Money as a string, and it is YOUR price — not the list price.
      price: money(effectivePrice(sku, owner.tier)),
    })),
  }));

  return Response.json({
    data,
    next_cursor: products.length === limit ? (products.at(-1)?.id ?? null) : null,
  });
});
