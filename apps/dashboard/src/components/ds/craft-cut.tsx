import { cn } from "@/lib/utils";

/**
 * Craft Cut — the smooth CNC-cut transition between two GWP colour fields,
 * ported from the design system's `components/brand/CraftCut`.
 *
 * DS rule 2: cross the sky/cream boundary at least once per screen with one of
 * these — never a straight rule — and at most TWICE per screen. It is the
 * motif that stops the app reading as stacked rectangles.
 *
 * Depth: 48–72px operational, 96–160px marketing (--craft-cut-depth is 72).
 *
 * The `style` prop carrying `from`/`to` is the one sanctioned inline style in
 * this migration: the colours are caller-chosen tokens, and a border-radius of
 * `56% 44% 0 0 / 100% 100% 0 0` has no Tailwind utility. The adherence gate's
 * hex check still catches a caller that passes a literal.
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
  className?: string;
};

const SWEEPS = {
  right: "56% 44% 0 0 / 100% 100% 0 0",
  left: "44% 56% 0 0 / 100% 100% 0 0",
  center: "50% 50% 0 0 / 100% 100% 0 0",
} as const;

export function CraftCut({
  from = "var(--surface-canvas)",
  to = "var(--surface-shell)",
  depth = 72,
  sweep = "right",
  edge = "bottom",
  className,
}: CraftCutProps) {
  return (
    <div
      data-slot="craft-cut"
      aria-hidden="true"
      className={cn("w-full overflow-hidden", className)}
      style={{ height: depth, background: from }}
    >
      <div
        className="h-full w-full"
        style={{
          background: to,
          borderRadius: SWEEPS[sweep],
          transform: edge === "top" ? "scaleY(-1)" : undefined,
        }}
      />
    </div>
  );
}
