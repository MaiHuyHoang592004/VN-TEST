import { cn } from "@/lib/utils";

/**
 * Craft Cut — the smooth CNC-cut transition between two GWP colour fields,
 * ported from the design system's `components/brand/CraftCut`.
 *
 * DS rule 2: cross the sky/cream boundary at least once per screen with one of
 * these — never a straight rule — and at most TWICE per screen. It is the
 * motif that stops the app reading as stacked rectangles.
 *
 * Depth: 48–72px operational, 96–160px marketing, 44px catalog
 * (--craft-cut-depth is 72).
 *
 * GEOMETRY (matches the DS exactly — this is the brand's signature curve, and
 * the readme's success criterion names it):
 *
 *   outer div  = the `to` colour (the section BELOW the cut)
 *   inner div  = the `from` colour (the section ABOVE), absolutely inset,
 *                with BOTTOM border-radii that curve `to` up into it
 *   edge="top" = scaleY(-1) on the WHOLE box, not just the inner div
 *
 * So the upper colour is carried DOWN into the lower surface, which is what
 * guidelines/18-craft-cut.card.html demonstrates ("The cut always carries the
 * upper colour down into the lower surface").
 *
 * The `style` prop carrying `from`/`to` is the one sanctioned inline style in
 * this migration: the colours are caller-chosen tokens, and a border-radius of
 * `0 0 100% 0 / 0 0 100% 0` has no Tailwind utility. The adherence gate's hex
 * check still catches a caller that passes a literal.
 */
export type CraftCutProps = {
  /** Colour of the section ABOVE the cut. Any GWP colour token. */
  from?: string;
  /** Colour of the section BELOW the cut. */
  to?: string;
  depth?: number;
  sweep?: "right" | "left" | "center";
  /** `bottom` cuts into the section below; `top` mirrors it. */
  edge?: "bottom" | "top";
  style?: React.CSSProperties;
  className?: string;
};

/**
 * The DS radii, verbatim from `_ds_bundle.js` → `function CraftCut`:
 *
 *   right:  "0 0 100% 0 / 0 0 100% 0"
 *   left:   "0 0 0 100% / 0 0 0 100%"
 *   center: "0 0 50% 50% / 0 0 100% 100%"
 *
 * These are applied to the `from` layer, so only its BOTTOM corners are cut.
 */
const SWEEPS = {
  right: "0 0 100% 0 / 0 0 100% 0",
  left: "0 0 0 100% / 0 0 0 100%",
  center: "0 0 50% 50% / 0 0 100% 100%",
} as const;

export function CraftCut({
  from = "var(--surface-canvas)",
  to = "var(--surface-shell)",
  depth = 72,
  sweep = "right",
  edge = "bottom",
  style,
  className,
}: CraftCutProps) {
  return (
    <div
      data-slot="craft-cut"
      aria-hidden="true"
      className={cn("relative w-full overflow-hidden", className)}
      style={{
        height: depth,
        background: to,
        transform: edge === "top" ? "scaleY(-1)" : undefined,
        ...style,
      }}
    >
      <div
        className="absolute inset-0"
        style={{ background: from, borderRadius: SWEEPS[sweep] }}
      />
    </div>
  );
}
