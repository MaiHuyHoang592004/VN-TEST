import { cn } from "@/lib/utils";

/**
 * Wood Rings — the concentric tree-ring watermark, ported from the design
 * system's `components/brand/WoodRings`.
 *
 * DRAWN WITH GRADIENTS ONLY. The DS is explicit about this: no SVG circles,
 * no borders, no stacked elements. One repeating-radial-gradient paints every
 * ring, alternating `--wood-ring-stroke` with `--wood-ring-stroke-soft` on the
 * half-step so the grain reads as wood rather than as a target.
 *
 * It is decoration, never content: aria-hidden, pointer-events-none, and
 * absolutely positioned so it cannot affect the layout of what it sits behind.
 * DS rule: one ring cluster per composition, and never behind a table, list or
 * form — it competes with data.
 */
export type WoodRingsProps = {
  /** Diameter in px. 280–760 for corner details, 900+ for full brand moments. */
  size?: number;
  /** Ring strength. `soft` for anything near content. */
  opacity?: "soft" | "default";
  className?: string;
};

const OPACITIES = {
  soft: 0.55,
  default: 1,
} as const;

/** Gradients only — the DS forbids drawing these rings as SVG circles. */
const RINGS = [
  "repeating-radial-gradient(circle at center,",
  "var(--wood-ring-stroke) 0 1px,",
  "transparent 1px calc(var(--wood-ring-gap) / 2),",
  "var(--wood-ring-stroke-soft) calc(var(--wood-ring-gap) / 2) calc(var(--wood-ring-gap) / 2 + 1px),",
  "transparent calc(var(--wood-ring-gap) / 2 + 1px) var(--wood-ring-gap))",
].join(" ");

export function WoodRings({
  size = 480,
  opacity = "default",
  className,
}: WoodRingsProps) {
  return (
    <div
      data-slot="wood-rings"
      aria-hidden="true"
      className={cn("pointer-events-none absolute select-none", className)}
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-pill)",
        backgroundImage: RINGS,
        opacity: OPACITIES[opacity],
      }}
    />
  );
}
