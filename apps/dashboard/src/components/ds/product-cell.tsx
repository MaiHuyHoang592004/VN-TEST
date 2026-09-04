import { cn } from "@/lib/utils";

/**
 * Product identity for dense rows and lists — ported from the design system's
 * `components/data/ProductCell`.
 *
 * Name in navy body type, the code beneath it in mono (a SKU is a figure, DS
 * rule 4), and an optional third `meta` line for the variant name, the units
 * left or a location. The thumbnail sits in a CREAM well: the DS's rule is
 * "thumbnails sit in a cream well, never a grey one — this is what keeps GWP
 * tables warm".
 *
 * `image` is a NODE, not a URL. That is the DS's own signature, and it is what
 * lets a caller hand over an interactive thumbnail (Orders opens the artwork
 * panel from it) without this component learning about dialogs. The prop is
 * three-valued on purpose:
 *
 *   image omitted     no well at all — a text-only identity cell, for a table
 *                     that already shows the artwork in another column
 *   image={null}      the empty cream well, i.e. the DS's warm placeholder for
 *                     a product whose thumbnail is missing
 *   image={<img />}   the picture, inside the well
 *
 * DOMAIN-BOUND, verbatim from ProductCell.d.ts: render whatever code string the
 * caller supplies. Do not construct, parse, validate or split a SKU here.
 */
const SIZES = {
  sm: { well: "size-8", gap: "gap-2.5", name: "text-(length:--fs-body-sm)" },
  md: { well: "size-9", gap: "gap-3", name: "text-(length:--fs-body)" },
  lg: { well: "size-12", gap: "gap-3", name: "text-(length:--fs-body-lg)" },
} as const;

export type ProductCellProps = {
  name: React.ReactNode;
  /** SKU or product code — rendered in mono. */
  code?: React.ReactNode;
  /** An `<img>` node. `null` renders the empty cream well; omitting the prop
   * renders no well. */
  image?: React.ReactNode;
  /** Third line — quantity left, warehouse location, variant name. */
  meta?: React.ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
};

export function ProductCell({
  name,
  code,
  image,
  meta,
  size = "md",
  className,
}: ProductCellProps) {
  const s = SIZES[size];

  return (
    <div
      data-slot="product-cell"
      className={cn("flex min-w-0 items-center", s.gap, className)}
    >
      {image !== undefined && (
        <div
          className={cn(
            "shrink-0 overflow-hidden rounded-(--radius-xs) bg-(--surface-content)",
            "[&_img]:size-full [&_img]:object-cover",
            s.well
          )}
        >
          {image}
        </div>
      )}
      <div className="min-w-0">
        <p className={cn("truncate font-sans font-semibold text-(--text-body)", s.name)}>
          {name}
        </p>
        {code && (
          <p className="truncate font-mono text-(length:--fs-meta) tracking-(--ls-mono) text-(--text-muted)">
            {code}
          </p>
        )}
        {meta && (
          <p className="truncate font-sans text-(length:--fs-meta) text-(--text-muted)">{meta}</p>
        )}
      </div>
    </div>
  );
}
