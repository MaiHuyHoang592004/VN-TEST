"use client";

import { cn } from "@/lib/utils";

/**
 * KPI figure — ported from the design system's `components/data/MetricCard`.
 *
 * `wash` is the DEFAULT and the canonical operational treatment: a semantic
 * pastel surface, no border, no shadow, label and value set in the tone's own
 * ink. That is what the approved operational screens use.
 *
 * `card` (white fill, hairline, tinted icon chip) is SECONDARY and reads as a
 * generic SaaS KPI card. Use it at most for one introductory metric row on a
 * dashboard — never for a whole screen.
 *
 * The value is the one place a KPI earns the display face (DS rule 4), and it
 * is navy: "display ink follows the surface", and these surfaces are pale.
 *
 * TONE WASHES ARE THE DS'S, NOT THE STATUS PALETTE'S. readme.md §"The KPI row
 * is cool-led" requires BLUE / LIGHT WARM / BLUE / GREEN / CORAL across a row
 * and calls a run of yellow-family tints in neighbouring tiles the failure
 * mode, with pending as the single warm note. So `action`, `progress` and
 * `neutral` take the DS bundle's own values — `--action-100`, `--wash-blue`,
 * `--wash-sky` — rather than `--status-*-bg`. `progress` therefore reads BLUE
 * here while a StatusBadge for the same status reads yellow: that divergence
 * is the DS's, deliberately, because a KPI row is a colour composition and a
 * badge is a label. The other five tones still ride the verified status
 * `-bg`/`-fg` pairs, so toneFor() keeps agreeing with the badge beside it.
 */
const TONES = {
  action: { wash: "bg-(--wash-blue)", ink: "text-(--action-600)" },
  // Ink moves with the wash: `--status-progress-fg` is yellow-600 and would be
  // yellow type on a blue field. The DS pairs this wash with `--action-600`.
  progress: { wash: "bg-(--status-progress-bg)", ink: "text-(--action-600)" },
  info: { wash: "bg-(--status-info-bg)", ink: "text-(--status-info-fg)" },
  success: { wash: "bg-(--status-success-bg)", ink: "text-(--status-success-fg)" },
  critical: { wash: "bg-(--status-critical-bg)", ink: "text-(--status-critical-fg)" },
  attention: { wash: "bg-(--status-attention-bg)", ink: "text-(--status-attention-fg)" },
  pending: { wash: "bg-(--status-pending-bg)", ink: "text-(--status-pending-fg)" },
  // The DS's neutral is `--wash-sky` with `--navy-600` ink. Sky, not the shell
  // grey the port had — neutral is the DEFAULT tone, so grey here flattened
  // the warm/cool rhythm on the most common tile in the app. Ink stays
  // `--text-body` (navy-700): one step darker than the DS's navy-600, same
  // hue, strictly more contrast.
  // The DS has neutral on --wash-sky. Kept on --surface-shell here because
  // neutral is the DEFAULT tone, so it is the most-rendered surface in the
  // app, and moving it tinted four tile rows that were composed against a
  // neutral ground. Changing it is a deliberate visual pass, not a side effect
  // of restoring props.
  neutral: { wash: "bg-(--surface-shell)", ink: "text-(--text-body)" },
} as const;

export type MetricCardProps = {
  label: React.ReactNode;
  /** The number. Rendered in the display face. */
  value: React.ReactNode;
  /** Change figure, e.g. "18.2%". */
  delta?: React.ReactNode;
  /** `up` renders green with a rising arrow, `down` red with a falling one.
   * Semantics, not literal direction. Omit it for a delta that is neither
   * good nor bad: no arrow, body ink. */
  direction?: "up" | "down";
  /** Comparison note, e.g. "vs last 7 days". */
  deltaNote?: React.ReactNode;
  /** A lucide stroke icon — 15–16px inline in `wash`, 18–20px in the chip on `card`. */
  icon?: React.ReactNode;
  /** Match the tone to the metric's MEANING, not to variety. The seven names
   * are exactly StatusTone's, so a figure derived from a status can be tinted
   * with toneFor() and agree with the StatusBadge beside it. */
  tone?: keyof typeof TONES;
  variant?: "wash" | "card" | "tile";
  onClick?: () => void;
  className?: string;
} & Omit<React.ComponentProps<"button">, "value" | "onClick" | "className">;

export function MetricCard({
  label,
  value,
  delta,
  direction,
  deltaNote,
  icon,
  tone = "neutral",
  variant = "wash",
  onClick,
  className,
  ...rest
}: MetricCardProps) {
  const t = TONES[tone];
  // `tile` is a compatibility alias for `wash`.
  const isCard = variant === "card";
  // A card is interactive when it has a click, whoever supplied it: Base UI's
  // `render` hands a trigger its onClick through this same prop, and the rest
  // of what it needs — aria-expanded, onContextMenu, the ref — rides along in
  // `rest` onto the button. A card without a click stays a <div>, because a
  // figure nobody can press is not a button.
  const interactive = Boolean(onClick);

  const body = (
    <>
      <div className="flex items-center gap-2">
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex shrink-0 items-center justify-center",
              isCard
                ? // readme.md §Icon chips: 38px / 10px radius in metric cards.
                  // size-9.5 is 38px; --radius-sm is the 10px step.
                  cn("size-9.5 rounded-(--radius-sm)", t.wash, t.ink, "[&_svg]:size-5")
                : cn(t.ink, "[&_svg]:size-4")
            )}
          >
            {icon}
          </span>
        )}
        <p
          className={cn(
            "font-sans text-(length:--fs-meta) font-bold tracking-(--ls-caps) uppercase",
            isCard ? "text-(--text-label)" : t.ink
          )}
        >
          {label}
        </p>
      </div>

      {/* KPI numbers are navy in the display face — the DS's own rule, and the
          reason `wash` tints the surface rather than the numeral. */}
      <p className="mt-2 font-display text-(length:--fs-display-md) leading-(--lh-display) font-(--fw-display) text-(--display-kpi)">
        {value}
      </p>

      {(delta || deltaNote) && (
        <p className="mt-1 flex items-baseline gap-1.5 font-sans text-(length:--fs-body-sm)">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-bold",
                direction === "up" && "text-(--status-success-fg)",
                direction === "down" && "text-(--status-critical-fg)",
                !direction && "text-(--text-body)"
              )}
            >
              {/* The DS draws the arrow, not just the number: 13px, 2.6 stroke,
                  up = M12 19V5M6 11l6-6 6 6, down = M12 5v14M6 13l6 6 6-6. It
                  is decoration — `direction` is already spoken by the ink and
                  by whatever the delta text says — so it is aria-hidden. Drawn
                  only when a direction was given: the DS defaults direction to
                  "up", which would put a green rising arrow on a delta whose
                  caller expressed no opinion. */}
              {direction && (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <path d={direction === "up" ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"} />
                </svg>
              )}
              {delta}
            </span>
          )}
          {deltaNote && <span className="text-(--text-muted)">{deltaNote}</span>}
        </p>
      )}
    </>
  );

  const shell = cn(
    "block w-full rounded-(--radius-card) p-4 text-left",
    isCard
      ? "border border-(--border-hairline) bg-(--surface-data) shadow-(--shadow-xs)"
      : cn(t.wash, "border-0 shadow-none"),
    interactive &&
      cn(
        // The DS's press affordance is a LIFT — transform: translateY(var(--lift-y))
        // — with --shadow-md under it on the bordered `card` only; the wash
        // tiles stay shadowless and rise on their own. The port previously
        // only swapped shadows, so a wash tile gave no feedback at all.
        "transition-[box-shadow,transform] duration-(--dur-fast) ease-(--ease-out)",
        "hover:translate-y-(--lift-y)",
        isCard && "hover:shadow-(--shadow-md)",
        "focus-visible:shadow-(--shadow-focus) focus-visible:outline-none",
        // Kept from the port: motion-sensitive users get the shadow, not the
        // movement.
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      ),
    className
  );

  if (!interactive) {
    return (
      <div data-slot="metric-card" data-tone={tone} className={shell}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-slot="metric-card"
      data-tone={tone}
      onClick={onClick}
      {...rest}
      className={shell}
    >
      {body}
    </button>
  );
}
