import { cn } from "@/lib/utils";

/**
 * The surface primitive that enforces the SKY → SHELL → WHITE hierarchy —
 * ported from the design system's `components/data/Surface`.
 *
 * Reach for this instead of hand-rolling a white box with a shadow. `Card`
 * (components/ui/card) remains the right choice where a header/footer/action
 * grid is wanted; `Surface` is for a plain panel that must declare which rung
 * of the ladder it sits on.
 *
 * Sky is the PAGE, never a rectangular panel trapped inside a card — so
 * `level="canvas"` is for a brand moment inside content, not for a data panel.
 */
const LEVELS = {
  canvas: "bg-(--surface-brand-block) text-navy-700",
  content: "bg-(--surface-content) text-navy-700",
  data: "bg-(--surface-data) text-(--text-body)",
  inset: "bg-(--surface-inset) text-(--text-body)",
  // For panels sitting on the admin sky→white dissolve field: the border and
  // the fading seam do the delineating, not a filled box.
  sheet: "bg-[image:var(--field-sheet)] text-(--text-body)",
} as const;

const RADII = {
  sm: "rounded-(--radius-sm)",
  md: "rounded-(--radius-md)",
  lg: "rounded-(--radius-lg)",
  xl: "rounded-(--radius-xl)",
  "2xl": "rounded-(--radius-2xl)",
  card: "rounded-(--radius-card)",
  surface: "rounded-(--radius-surface)",
  hero: "rounded-(--radius-hero)",
} as const;

const SHADOWS = {
  none: "",
  xs: "shadow-(--shadow-xs)",
  sm: "shadow-(--shadow-sm)",
  md: "shadow-(--shadow-md)",
  lg: "shadow-(--shadow-lg)",
} as const;

export type SurfaceProps = {
  level?: keyof typeof LEVELS;
  radius?: keyof typeof RADII;
  shadow?: keyof typeof SHADOWS;
  /** 1px --border-soft hairline. Required on level="sheet". */
  outline?: boolean;
  pad?: boolean;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Pinned right of the header — a Select, link or small Button. */
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function Surface({
  level = "data",
  radius = "card",
  shadow = "sm",
  outline = false,
  pad = true,
  title,
  subtitle,
  action,
  children,
  className,
}: SurfaceProps) {
  const hasHeader = Boolean(title || subtitle || action);

  return (
    <section
      data-slot="surface"
      data-level={level}
      className={cn(
        LEVELS[level],
        RADII[radius],
        SHADOWS[shadow],
        // The DS makes the hairline mandatory on `sheet`, so it is applied
        // whether or not the caller remembered `outline`.
        (outline || level === "sheet") && "border border-(--border-soft)",
        // ONE padding on the section, not the DS's header/body split. The DS
        // model is more correct in the abstract, and it broke eleven callers
        // that position or pad this panel through `className` — they compose
        // against a single padded box. p-5 is one --space step under
        // --pad-surface; closing that gap is a separate, deliberate pass.
        pad && "p-5",
        className
      )}
    >
      {hasHeader && (
        <header
          className={cn(
            "flex items-start justify-between gap-4",
            pad && "mb-4",
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong)">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 font-sans text-(length:--fs-body-sm) text-(--text-muted)">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
