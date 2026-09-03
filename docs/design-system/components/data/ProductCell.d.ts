/**
 * Product identity for dense rows and lists: cream thumbnail well, product
 * name, and the SKU / product code in mono beneath.
 *
 * ── DOMAIN-BOUND ────────────────────────────────────────────────────────────
 * SKU construction rules and BOM hierarchy are NOT VERIFIED. The order fields
 * `order_sku`, `product`, `variant` and `barcode` exist in the backend, and the
 * frontend has Products / Variants / BOM modules — but the format of a SKU, how
 * variants compose into one, and how a BOM nests were not read.
 *
 * Render whatever code string the caller supplies. Do not construct, parse,
 * validate or split a SKU here.
 * ────────────────────────────────────────────────────────────────────────────
 */
export interface ProductCellProps {
  name: React.ReactNode;
  /** SKU or product code — rendered in mono. */
  code?: React.ReactNode;
  /** An `<img>` node. The cream well shows through when omitted. */
  image?: React.ReactNode;
  /** Third line — quantity left, warehouse location, variant name. */
  meta?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}
export function ProductCell(props: ProductCellProps): JSX.Element;
