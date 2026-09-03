import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The loading surface for a panel — ported from the design system's
 * `components/feedback/LoadingState`.
 *
 * Skeleton rows, never a spinner on a data surface: per STATES.md, a spinner
 * says "something is happening" where a skeleton says "this much content is
 * coming". `aria-busy` + a live label is how a screen reader learns the same.
 */
export type LoadingStateProps = {
  label?: React.ReactNode;
  rows?: number;
  className?: string;
};

export function LoadingState({ label, rows = 4, className }: LoadingStateProps) {
  return (
    <div
      data-slot="loading-state"
      aria-busy="true"
      aria-live="polite"
      className={cn("flex flex-col gap-2", className)}
    >
      {label && (
        <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">{label}</p>
      )}
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={`loading-row-${i}`} className="h-10 w-full" />
      ))}
    </div>
  );
}
