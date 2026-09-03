import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/modules/core/guard";
import { getProduct } from "@/modules/catalog/products/queries";
import {
  listAttachableVariants,
  listSkusForProduct,
} from "@/modules/catalog/product-variants/queries";
import { Badge } from "@/components/ui/badge";
import { SkuGrid } from "@/components/pages/admin/products/skus/sku-grid";

/**
 * The SKUs of one variant and their tier prices — the screen the pricing rules
 * are actually operated from.
 *
 * Prices are serialised as fixed-2 STRINGS, never numbers: Decimal does not
 * survive the server→client boundary and a float would lose cents. They stay
 * strings through the input, the action and zod, all the way to Prisma.Decimal.
 */
export default async function ProductVariantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("products.manage");

  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();

  const [variant, skus, attachable] = await Promise.all([
    getProduct(id),
    listSkusForProduct(id),
    listAttachableVariants(id),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <div className="mb-6 flex flex-col gap-2">
        <Link
          href="/admin/products"
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" />
          {variant.name}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{variant.name}</h1>
          <Badge product={variant.status === "ACTIVE" ? "default" : "secondary"}>
            {variant.status}
          </Badge>
          <span className="text-muted-foreground font-mono text-sm">{variant.key}</span>
        </div>
      </div>

      <SkuGrid
        productId={id}
        attachable={attachable}
        rows={skus.map((s) => ({
          id: s.id,
          variantId: s.variantId,
          variantName: s.product.name,
          variantKey: s.product.key,
          sku: s.sku,
          position: s.position,
          stock: s.stock,
          status: s.status,
          salePrice: s.salePrice.toFixed(2),
          prices: Object.fromEntries(s.prices.map((p) => [p.tier, p.price.toFixed(2)])),
        }))}
      />
    </main>
  );
}
