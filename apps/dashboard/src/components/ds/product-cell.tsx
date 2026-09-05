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
 * KNOWN INVERSION, kept on purpose: ProductCell.d.ts says "the cream well shows
 * through when omitted", and the compiled DS agrees — it renders the well
 * unconditionally and puts `image` inside it, so an omitted `image` there means
 * the EMPTY well. The port swaps the two: omitted means no well, and the empty
 * well is asked for explicitly with `image={null}`. Reverting would put a cream
 * square on every text-only identity cell in the app (inventory stock and
 * movements tables pass no image at all) — a decoration the caller never asked
 * for and cannot remove, since the allowlist has no prop to suppress it. The
 * DS's placeholder is still reachable, just spelled `image={null}`.
 *
 * DOMAIN-BOUND, verbatim from ProductCell.d.ts: render whatever code string the
 * caller supplies. Do not construct, parse, validate or split a SKU here.
 */
// The DS's own scale, verbatim:
//   const px = size === "sm" ? 32 : size === "lg" ? 52 : 40;
// 32 / 40 / 52 — NOT 32/36/48. The port had shrunk md and lg by 4px each,
// which is enough to make a thumbnail row read as a different density than the
// design. size-10 = 40px and size-13 = 52px on Tailwind v4's dynamic spacing
// scale (0.25rem step).
const SIZES = {
  sm: { well: "size-8", gap: "gap-2.5", name: "text-(length:--fs-body-sm)" },
  md: { well: "size-10", gap: "gap-3", name: "text-(length:--fs-body)" },
  lg: { well: "size-13", gap: "gap-3", name: "text-(length:--fs-body-lg)" },
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
            // cream-200, not --surface-content (cream-100). README §9 and the
            // Orders design both specify --cream-200 for the product well:
            // one step down from the cream shell, so the well still reads as
            // a recess when the row behind it is white.
            //
            // The hairline is half the recess. The DS well is BOTH:
            //   background: "var(--cream-200)",
            //   border: "1px solid var(--border-hairline)",
            // Cream-200 alone is too close to a white row to draw its own edge,
            // so without the border the well dissolves and an empty one
            // (image={null}) disappears entirely. Tailwind's bare `border` is
            // the 1px solid; the token supplies the colour.
            "shrink-0 overflow-hidden rounded-(--radius-xs) border border-(--border-hairline) bg-(--cream-200)",
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
