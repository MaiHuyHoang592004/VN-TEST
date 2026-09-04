import { cn } from "@/lib/utils";

/**
 * The GoodWoodPrint mark, ported from the design system's
 * `components/brand/GwpMark`.
 *
 * The vendored assets in `public/gwp/` carry hard-coded fills (#5EA8D8,
 * #0F3A5F, #0078C1), so they are rendered inline as JSX rather than through
 * next/image: that is the only way `tone` can drive the fill from tokens, and
 * it keeps the marks out of the adherence gate's hex check.
 *
 * ── COLOUR RULE ────────────────────────────────────────────────────────────
 * The logo is BRAND LIGHT, not information ink:
 *   · on cream, white or the floating nav shell → `tone="sky"` (the default)
 *   · on bright sky                             → `tone="cream"`
 *   · `tone="navy"`                             → technical / utility only
 * A navy mark reads heavy, corporate and administrative, so it is never the
 * default. Logotypes are exempt from WCAG 1.4.3.
 */
export type GwpMarkProps = {
  /** Rendered height in px. The mark keeps its own aspect ratio. */
  size?: number;
  tone?: keyof typeof TONES;
  /** Render the stacked GoodWoodPrint wordmark instead of the monogram. */
  withWordmark?: boolean;
  className?: string;
};

const TONES = {
  /** Light sky on cream, white and the nav shell — the brand default. */
  sky: {
    mark: "var(--logo-on-light)",
    word: "var(--logo-technical)",
    accent: "var(--logo-on-light-accent)",
  },
  /** The inverse mark, on bright sky fields. */
  cream: {
    mark: "var(--logo-on-sky)",
    word: "var(--logo-on-sky)",
    accent: "var(--logo-on-sky)",
  },
  /** Technical / utility only: favicons, watermarks, stamps, dense data. */
  navy: {
    mark: "var(--logo-technical)",
    word: "var(--logo-technical)",
    accent: "var(--display-accent)",
  },
} as const;

export function GwpMark({
  size = 48,
  tone = "sky",
  withWordmark = false,
  className,
}: GwpMarkProps) {
  const t = TONES[tone];

  if (withWordmark) {
    // The stacked lockup: Good / Wood in the word ink, Print in the accent.
    return (
      <svg
        data-slot="gwp-mark"
        viewBox="0 0 200 96"
        width={(size * 200) / 96}
        height={size}
        role="img"
        aria-label="GoodWoodPrint"
        className={cn("font-display", className)}
      >
        <text fontWeight="800" fontSize="30" letterSpacing="-0.6">
          <tspan x="0" y="30" fill={t.word}>
            Good
          </tspan>
          <tspan x="0" y="60" fill={t.word}>
            Wood
          </tspan>
          <tspan x="0" y="90" fill={t.accent}>
            Print
          </tspan>
        </text>
      </svg>
    );
  }

  // The monogram: the tree-ring signature plus the GWP letterform.
  return (
    <svg
      data-slot="gwp-mark"
      viewBox="0 0 132 48"
      width={(size * 132) / 48}
      height={size}
      role="img"
      aria-label="GoodWoodPrint"
      className={cn("font-display", className)}
    >
      <g fill="none" stroke={t.mark} strokeWidth="2.2">
        <circle cx="24" cy="24" r="5" />
        <circle cx="24" cy="24" r="10.5" />
        <circle cx="24" cy="24" r="16" />
        <circle cx="24" cy="24" r="21" />
      </g>
      <circle cx="24" cy="24" r="2" fill={t.mark} />
      <text
        x="54"
        y="31"
        fontWeight="800"
        fontSize="26"
        letterSpacing="-0.5"
        fill={t.word}
      >
        GWP
      </text>
    </svg>
  );
}
