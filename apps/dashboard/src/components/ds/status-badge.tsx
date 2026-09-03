import { cn } from "@/lib/utils";

import { toneFor, type StatusTone } from "./status-tones";

/**
 * Status pill for fulfilment, tracking, stock and ticket states — ported from
 * the design system's `components/core/StatusBadge`.
 *
 * Pass the literal backend status string; the component maps it to a tone via
 * the canonical map. Do NOT pass a colour, and do NOT pick a Badge variant by
 * hand at the call site — that is exactly the drift this component exists to
 * stop. `tone` is an escape hatch for statuses outside the known set only.
 *
 * `children` overrides the visible label so a caller keeps its own
 * `t()`-translated text while the colour still derives from `status`. Enum
 * values themselves are data and must never be translated (I18N.md).
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-(--status-success-bg) text-(--status-success-fg)",
  progress: "bg-(--status-progress-bg) text-(--status-progress-fg)",
  info: "bg-(--status-info-bg) text-(--status-info-fg)",
  pending: "bg-(--status-pending-bg) text-(--status-pending-fg)",
  attention: "bg-(--status-attention-bg) text-(--status-attention-fg)",
  critical: "bg-(--status-critical-bg) text-(--status-critical-fg)",
  neutral: "bg-(--status-neutral-bg) text-(--status-neutral-fg)",
};

const DOT_CLASSES: Record<StatusTone, string> = {
  success: "bg-(--status-success-dot)",
  progress: "bg-(--status-progress-dot)",
  info: "bg-(--status-info-dot)",
  pending: "bg-(--status-pending-dot)",
  attention: "bg-(--status-attention-dot)",
  critical: "bg-(--status-critical-dot)",
  neutral: "bg-(--status-neutral-dot)",
};

export type StatusBadgeProps = {
  /** The status text as it exists in the system, e.g. "IN_PRODUCTION", "open". */
  status: string;
  /** Override the auto-mapped tone. Only for statuses outside the known set. */
  tone?: StatusTone;
  dot?: boolean;
  size?: "sm" | "md";
  /** Slow pulse on the dot — for genuinely in-flight states only. */
  pulse?: boolean;
  className?: string;
  /** Replaces the rendered label; the colour still comes from `status`. */
  children?: React.ReactNode;
};

export function StatusBadge({
  status,
  tone,
  dot = true,
  size = "md",
  pulse = false,
  className,
  children,
}: StatusBadgeProps) {
  const resolved = tone ?? toneFor(status);

  return (
    <span
      data-slot="status-badge"
      data-tone={resolved}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap",
        "rounded-(--radius-pill) font-sans font-semibold tracking-(--ls-label)",
        size === "sm"
          ? "h-5 px-2 text-(length:--fs-micro)"
          : "h-6 px-2.5 text-(length:--fs-meta)",
        TONE_CLASSES[resolved],
        className
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            DOT_CLASSES[resolved],
            // prefers-reduced-motion must silence the named keyframe.
            pulse && "animate-pulse motion-reduce:animate-none"
          )}
        />
      )}
      {children ?? status}
    </span>
  );
}
