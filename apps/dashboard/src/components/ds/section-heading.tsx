import { cn } from "@/lib/utils";

/**
 * The heading above a group of panels — ported from the design system's
 * `components/data/SectionHeading`.
 *
 * The eyebrow is navy, uppercase and tracked; the title is the display face;
 * the subtitle is navy-500, which is the contrast floor and never dimmed
 * further with opacity.
 */
export type SectionHeadingProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function SectionHeading({
  title,
  subtitle,
  eyebrow,
  action,
  className,
}: SectionHeadingProps) {
  return (
    <div
      data-slot="section-heading"
      className={cn("flex items-end justify-between gap-4", className)}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="font-sans text-(length:--fs-micro) font-bold tracking-(--ls-caps) uppercase text-(--text-label)">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong)">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 font-sans text-(length:--fs-body-sm) text-(--text-muted)">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
