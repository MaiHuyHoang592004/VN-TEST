import { cn } from "@/lib/utils";

import type { StatusTone } from "./status-tones";

/**
 * An inline notice — ported from the design system's
 * `components/feedback/Callout`.
 *
 * A callout is a semantic wash with the tone's own ink, matching StatusBadge
 * and MetricCard so one meaning has one colour across the whole app. Not a
 * toast: this stays on the page and does not time out.
 *
 * ALL SEVEN TONES. The DS's `Callout` computes its colours as
 * `background: var(--status-${tone}-bg)` / `color: var(--status-${tone}-fg)`,
 * so it accepts every tone the token layer defines and its .d.ts spells the
 * union out: success | progress | info | pending | attention | critical |
 * neutral. This port used to hard-code only four of them, which made
 * `tone="pending"` a type error rather than a documented subset. The map below
 * is keyed by `StatusTone` — the same union `status-tones.ts` publishes — so
 * the compiler now fails if the DS ever adds an eighth tone and this file does
 * not follow. Tailwind cannot see a template-literal class name, so the seven
 * pairs are written out rather than interpolated; the tokens are identical.
 */
const TONES: Readonly<Record<StatusTone, string>> = {
  success: "bg-(--status-success-bg) text-(--status-success-fg)",
  progress: "bg-(--status-progress-bg) text-(--status-progress-fg)",
  info: "bg-(--status-info-bg) text-(--status-info-fg)",
  pending: "bg-(--status-pending-bg) text-(--status-pending-fg)",
  attention: "bg-(--status-attention-bg) text-(--status-attention-fg)",
  critical: "bg-(--status-critical-bg) text-(--status-critical-fg)",
  neutral: "bg-(--status-neutral-bg) text-(--status-neutral-fg)",
};

export type CalloutProps = {
  /**
   * Per Callout.prompt.md: `info`/`neutral` for a plain note, `attention` for
   * "not yet confirmed with the backend" (never `critical` — that reads as an
   * error and this isn't one), `success` for a completed-action confirmation.
   */
  tone?: StatusTone;
  title?: React.ReactNode;
  /**
   * Defaults to a small info-circle glyph, as the DS's Callout.d.ts documents.
   * Pass `icon={false}` to render none.
   */
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/**
 * The DS's default glyph — `Dot()` in the compiled bundle, an info circle
 * (`<circle cx=12 cy=12 r=9 />` plus `M12 8v5M12 16.5v.01`) stroked in
 * `currentColor` at width 2 with round caps, so it inherits the tone's ink.
 *
 * Drawn here rather than pulled from lucide: the DS ships this exact path, and
 * an icon-library "info" would drift from it. The DS hard-codes 15px; the port
 * leaves the size to the wrapper's `[&_svg]:size-4` so a default glyph and a
 * caller-supplied one line up at the same 16px instead of differing by a pixel.
 */
function CalloutGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.01" />
    </svg>
  );
}

export function Callout({
  tone = "info",
  title,
  icon,
  action,
  children,
  className,
}: CalloutProps) {
  /**
   * The DS writes `icon || <Dot/>`. `??` instead of `||` so that `icon={false}`
   * — the ordinary React way to say "not this one" — opts out of the glyph
   * entirely; the DS has no such escape hatch and would draw the Dot anyway.
   * Additive: omitting `icon`, or passing `null`, still gets the DS default.
   */
  const glyph = icon ?? <CalloutGlyph />;

  return (
    <div
      data-slot="callout"
      data-tone={tone}
      className={cn(
        "flex items-start gap-3 rounded-(--radius-card) p-4",
        TONES[tone],
        className
      )}
    >
      {glyph ? (
        <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-4">
          {glyph}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {title && (
          <p className="font-sans text-(length:--fs-body) font-bold">{title}</p>
        )}
        <div className={cn("font-sans text-(length:--fs-body-sm)", title && "mt-1")}>
          {children}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
