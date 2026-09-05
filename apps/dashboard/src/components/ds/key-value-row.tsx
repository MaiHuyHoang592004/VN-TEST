"use client";


import { cn } from "@/lib/utils";

import type { StatusTone } from "./status-tones";

/**
 * A label/value pair in a detail panel — ported from the design system's
 * `components/data/KeyValueRow`.
 *
 * `mono` is not decoration: per DS rule 4, order IDs, SKUs, tracking numbers
 * and money are set in IBM Plex Mono. Pass it for those and nothing else.
 *
 * `tone` tints the VALUE INK ONLY — verbatim from the DS, whose value span is
 *   color: tone ? `var(--status-${tone}-fg)` : "var(--navy-900)"
 * i.e. no background, no border, no dot. It is the quick positive/negative read
 * on a field that is not itself a status pill (a negative balance, a failed
 * charge); leave it unset for ordinary fields. The seven tones are the
 * canonical StatusTone set, so a caller writes `tone="critical"`, never a
 * colour.
 *
 * MARKUP — <dt>/<dd>, and the caller owns the <dl>.
 * These two elements are only valid inside a <dl>, so this row does not stand
 * alone: two of its three callers already wrap one, and the third should. It
 * was briefly rewritten to <span role="term">/<span role="definition"> to make
 * the row self-sufficient — which fixed that third caller and invalidated the
 * two correct ones, since a <dl> may not contain spans either. Fewer broken
 * callers this way, and <dt>/<dd> is what the DS emits.
 */
const TONE_INK: Record<StatusTone, string> = {
  success: "text-(--status-success-fg)",
  progress: "text-(--status-progress-fg)",
  info: "text-(--status-info-fg)",
  pending: "text-(--status-pending-fg)",
  attention: "text-(--status-attention-fg)",
  critical: "text-(--status-critical-fg)",
  neutral: "text-(--status-neutral-fg)",
};

export type KeyValueRowProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
  /** Tints the value ink only. Omit for an ordinary field. */
  tone?: StatusTone;
  className?: string;
};

export function KeyValueRow({
  label,
  value,
  mono = false,
  tone,
  className,
}: KeyValueRowProps) {
  return (
    <div
      data-slot="key-value-row"
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-(--border-hairline) py-2.5 last:border-b-0",
        className
      )}
    >
      <dt className="font-sans text-(length:--fs-body-sm) text-(--text-label)">
        {label}
      </dt>
      <dd
        className={cn(
          "text-right text-(length:--fs-body) font-semibold",
          // Untoned stays --text-body: that is this app's token for the DS's
          // literal navy-900, and the tone branch is the DS's own else-arm.
          tone ? TONE_INK[tone] : "text-(--text-body)",
          mono ? "font-mono tracking-(--ls-mono)" : "font-sans"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
