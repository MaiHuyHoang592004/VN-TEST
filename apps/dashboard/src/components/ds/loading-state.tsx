import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The loading surface for a panel — ported from the design system's
 * `components/feedback/LoadingState`.
 *
 * Skeleton rows, never a spinner on a data surface: per STATES.md, a spinner
 * says "something is happening" where a skeleton says "this much content is
 * coming". role="status" + aria-busy is how a screen reader learns the same.
 */
export type LoadingStateProps = {
  label?: React.ReactNode;
  rows?: number;
  /**
   * WHAT is loading, so the placeholder has the shape of the thing it stands
   * in for. The DS ships all three and the port had none of them:
   *   rows  — a table skeleton (the default; unchanged behaviour)
   *   cards — an auto-fill grid, for a card grid
   *   brand — the Wood Ring loader, for a full-surface wait. It is one of the
   *           two brand motifs and had no home anywhere in the app.
   */
  variant?: "rows" | "cards" | "brand";
  className?: string;
};

export function LoadingState({
  label,
  rows = 4,
  variant = "rows",
  className,
}: LoadingStateProps) {
  return (
    <div
      data-slot="loading-state"
      data-variant={variant}
      // role="status" as the DS has it: aria-busy on a non-live region is the
      // weaker signal, and a bare <LoadingState /> announced nothing at all
      // before `label` gained its default.
      role="status"
      // BOTH: role=status is the DS's, and aria-busy is what actually says
      // "still working" while `label` is optional and usually omitted. Dropping
      // it left the default case announcing nothing at all.
      aria-busy="true"
      aria-live="polite"
      className={cn(
        variant === "brand"
          ? "flex flex-col items-center justify-center gap-3 py-10"
          : "flex flex-col gap-2",
        className,
      )}
    >
      {variant === "brand" ? (
        // The Wood Ring, drawn as the DS draws it: a repeating radial
        // gradient, never SVG circles. motion-safe so a reduced-motion reader
        // gets a still ring rather than nothing.
        <span
          aria-hidden
          className="size-14 rounded-full motion-safe:animate-[gwp-ring_1.6s_var(--ease-out)_infinite]"
          style={{
            background:
              "repeating-radial-gradient(circle at 50% 50%, var(--wood-ring-stroke) 0 1px, transparent 1px 6px)",
          }}
        />
      ) : variant === "cards" ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={`loading-card-${i}`} className="h-32 w-full rounded-(--radius-card)" />
          ))}
        </div>
      ) : (
        Array.from({ length: rows }, (_, i) => (
          <Skeleton key={`loading-row-${i}`} className="h-10 w-full" />
        ))
      )}
      {label && (
        <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">{label}</p>
      )}
    </div>
  );
}
