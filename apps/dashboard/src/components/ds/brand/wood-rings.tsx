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
 * form — it competes with data. `anchor="center"` is only for empty states and
 * loaders.
 *
 * POSITIONING BELONGS TO THE COMPONENT. `anchor` + `offset` are the DS's own
 * API and the reason this component exists: a caller that writes
 * `className="absolute -top-8 -right-8"` has moved a brand decision back into
 * a page's Tailwind classes, where the next page will choose differently.
 */
export type WoodRingsProps = {
  /** Diameter in px. 280–760 for corner details, 900+ for full brand moments. */
  size?: number;
  /**
   * Wrapper opacity — the whole cluster, painted then faded. Use it to sink an
   * already-correct cluster further behind content.
   */
  opacity?: "soft" | "default";
  /**
   * DS ring strength: the alpha INSIDE the gradient, so the strokes thin out
   * rather than the cluster greying out. `soft` for anything near content,
   * `strong` for a full brand moment.
   */
  strength?: "soft" | "medium" | "strong";
  /** Which edge the ring cluster is cropped against. Omit to position by hand. */
  anchor?: keyof typeof ANCHORS;
  /** Inset from that edge — negative values crop the rings (the intended look). */
  offset?: string;
  /** px between rings. 10 = tight/young wood, 20 = open/old wood. */
  spacing?: number;
  /** Degrees. The grain is radial, so this only matters for a rotated crop. */
  rotate?: number;
  className?: string;
};

const OPACITIES = {
  soft: 0.55,
  default: 1,
} as const;

/**
 * DS strength → alpha multiplier on the ring tokens.
 *
 * The DS hard-codes its navy strokes as rgba(15,58,95, 0.06 / 0.10 / 0.16) for
 * soft / medium / strong. `--wood-ring-stroke` is exactly the 0.10 step and
 * `--wood-ring-stroke-soft` the 0.06 one, so `medium` is the tokens verbatim
 * and the other two are derived from them — 0.6× and 1.6× — with CSS relative
 * colour rather than a second set of literals. Nothing new enters the palette.
 *
 * DS default is `soft`; this port defaults to `medium` because that is what
 * every existing call site renders today.
 */
const STRENGTHS = {
  soft: 0.6,
  medium: 1,
  strong: 1.6,
} as const;

const stroke = (token: string, scale: number) =>
  scale === 1
    ? `var(${token})`
    : `oklch(from var(${token}) l c h / calc(alpha * ${scale}))`;

/** Gradients only — the DS forbids drawing these rings as SVG circles. */
const rings = (scale: number) =>
  [
    "repeating-radial-gradient(circle at center,",
    `${stroke("--wood-ring-stroke", scale)} 0 1px,`,
    "transparent 1px calc(var(--wood-ring-gap) / 2),",
    `${stroke("--wood-ring-stroke-soft", scale)} calc(var(--wood-ring-gap) / 2) calc(var(--wood-ring-gap) / 2 + 1px),`,
    "transparent calc(var(--wood-ring-gap) / 2 + 1px) var(--wood-ring-gap))",
  ].join(" ");

/**
 * The DS's feather, verbatim from `_ds_bundle.js` → `function WoodRings`:
 *
 *   radial-gradient(circle at 50% 50%, #000 34%, rgba(0,0,0,0.55) 68%, transparent 100%)
 *
 * Without it the cluster stops dead on the edge of its box and reads as a
 * clipped circle instead of grain running out of frame. This is an ALPHA RAMP,
 * not a colour: a mask only ever reads the alpha channel, so it is written in
 * neutral `hsl()` rather than pulled from the palette — there is no token for
 * "opaque" and inventing one would be worse.
 */
const RING_MASK =
  "radial-gradient(circle at 50% 50%, hsl(0 0% 0%) 34%, hsl(0 0% 0% / 0.55) 68%, transparent 100%)";

const ANCHORS = {
  "top-right": (offset: string) => ({ top: offset, right: offset }),
  "top-left": (offset: string) => ({ top: offset, left: offset }),
  "bottom-right": (offset: string) => ({ bottom: offset, right: offset }),
  "bottom-left": (offset: string) => ({ bottom: offset, left: offset }),
  center: () => ({ top: "50%", left: "50%" }),
} as const;

export function WoodRings({
  size = 480,
  opacity = "default",
  strength = "medium",
  anchor,
  offset = "-25%",
  spacing,
  rotate = 0,
  className,
}: WoodRingsProps) {
  // `center` centres by translating itself, so its rotation has to ride along
  // in the same transform — matching the DS.
  const spin = rotate ? `rotate(${rotate}deg)` : "";
  const transform =
    anchor === "center" ? `translate(-50%,-50%) ${spin}`.trim() : spin || undefined;

  return (
    <div
      data-slot="wood-rings"
      data-anchor={anchor}
      aria-hidden="true"
      className={cn("pointer-events-none absolute select-none", className)}
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-pill)",
        backgroundImage: rings(STRENGTHS[strength]),
        maskImage: RING_MASK,
        WebkitMaskImage: RING_MASK,
        opacity: OPACITIES[opacity],
        // `spacing` overrides the token for this cluster only; left alone, the
        // theme's --wood-ring-gap (14px, the DS default) still drives it.
        ...(spacing ? { ["--wood-ring-gap"]: `${spacing}px` } : null),
        ...(anchor ? ANCHORS[anchor](offset) : null),
        transform,
      } as React.CSSProperties}
    />
  );
}
