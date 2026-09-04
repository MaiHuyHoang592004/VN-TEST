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
 */
const TONES = {
  action: { wash: "bg-(--wash-blue)", ink: "text-(--action-600)" },
  progress: { wash: "bg-(--status-progress-bg)", ink: "text-(--status-progress-fg)" },
  info: { wash: "bg-(--status-info-bg)", ink: "text-(--status-info-fg)" },
  success: { wash: "bg-(--status-success-bg)", ink: "text-(--status-success-fg)" },
  critical: { wash: "bg-(--status-critical-bg)", ink: "text-(--status-critical-fg)" },
  attention: { wash: "bg-(--status-attention-bg)", ink: "text-(--status-attention-fg)" },
  pending: { wash: "bg-(--status-pending-bg)", ink: "text-(--status-pending-fg)" },
  neutral: { wash: "bg-(--surface-shell)", ink: "text-(--text-body)" },
} as const;

export type MetricCardProps = {
  label: React.ReactNode;
  /** The number. Rendered in the display face. */
  value: React.ReactNode;
  /** Change figure, e.g. "18.2%". */
  delta?: React.ReactNode;
  /** `up` renders green, `down` red. Semantics, not literal direction. */
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
                ? cn("size-9 rounded-(--radius-control)", t.wash, t.ink, "[&_svg]:size-5")
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
                "font-bold",
                direction === "up" && "text-(--status-success-fg)",
                direction === "down" && "text-(--status-critical-fg)",
                !direction && "text-(--text-body)"
              )}
            >
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
      "transition-shadow duration-(--dur-fast) ease-(--ease-out) hover:shadow-(--shadow-sm) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none",
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
