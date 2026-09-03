import { listProducts } from "@/modules/catalog/products/queries";
import { listSkusWithMyPrice } from "@/modules/catalog/product-variants/queries";
import { CatalogBrowser } from "@/components/pages/catalog/catalog-browser";

/**
 * What a seller can order, at THEIR price.
 *
 * Two things this page must get right, both handled in the query layer rather
 * than here: a restricted partner sees only their allow-listed products
 * (productScope), and the price shown is effectivePrice for the VIEWER's tier —
 * resolved on the server from the session, never passed in, so nobody can ask
 * what another tier pays.
 *
 * Read-only by design: sellers order through /orders, not from here.
 */
export default async function CatalogPage() {
  const { rows } = await listProducts({ status: "ACTIVE", pageSize: 100 });

  // One query per variant. Fine at catalogue scale (tens of products) and it
  // keeps the scope check on each; batch it if the catalogue ever grows to
  // hundreds. ponytail: N+1 by choice, not by accident.
  const products = await Promise.all(
    rows.map(async (p) => ({
      id: p.id,
      name: p.name,
      key: p.key,
      thumbnail: p.thumbnail,
      // Unpriced SKUs are NOT offered. effectivePrice bottoms out at salePrice
      // (default 0), so an attached-but-never-priced SKU would read as free —
      // and a seller who ordered it would be charged nothing. Price it first.
      skus: (await listSkusWithMyPrice(p.id))
        .filter((s) => s.status === "ACTIVE" && s.priced)
        .map((s) => ({
          id: s.id,
          variantName: s.product.name,
          sku: s.sku,
          price: s.price,
        })),
    })),
  );

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-20">
      <CatalogBrowser products={products.filter((p) => p.skus.length > 0)} />
    </main>
  );
}
