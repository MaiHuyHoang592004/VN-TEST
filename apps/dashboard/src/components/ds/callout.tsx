import { cn } from "@/lib/utils";

/**
 * An inline notice — ported from the design system's
 * `components/feedback/Callout`.
 *
 * A callout is a semantic wash with the tone's own ink, matching StatusBadge
 * and MetricCard so one meaning has one colour across the whole app. Not a
 * toast: this stays on the page and does not time out.
 */
const TONES = {
  info: "bg-(--status-info-bg) text-(--status-info-fg)",
  attention: "bg-(--status-attention-bg) text-(--status-attention-fg)",
  critical: "bg-(--status-critical-bg) text-(--status-critical-fg)",
  success: "bg-(--status-success-bg) text-(--status-success-fg)",
} as const;

export type CalloutProps = {
  tone?: keyof typeof TONES;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function Callout({
  tone = "info",
  title,
  icon,
  action,
  children,
  className,
}: CalloutProps) {
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
      {icon && (
        <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-4">
          {icon}
        </span>
      )}
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
