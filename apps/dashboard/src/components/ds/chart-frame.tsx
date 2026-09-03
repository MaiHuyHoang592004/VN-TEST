import { cn } from "@/lib/utils";

import { Surface } from "./surface";

/**
 * The frame every chart sits in — ported from the design system's
 * `components/data/ChartFrame`.
 *
 * The frame owns the title, the surface and the height; the caller owns the
 * chart. Series colours come from --chart-1…5 (mapped to GWP accents in
 * globals.css), never from a literal passed at the call site.
 *
 * NOTE (BE_ALIGNMENT.md): backend chart series are NOT zero-filled — a day
 * with no data is absent from the array rather than present as 0. This frame
 * does not fabricate the missing points, and neither should a caller.
 */
export type ChartFrameProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  height?: number;
  children: React.ReactNode;
  className?: string;
};

export function ChartFrame({
  title,
  subtitle,
  action,
  height = 280,
  children,
  className,
}: ChartFrameProps) {
  return (
    <Surface
      level="data"
      title={title}
      subtitle={subtitle}
      action={action}
      className={cn("overflow-hidden", className)}
    >
      <div style={{ height }} className="w-full">
        {children}
      </div>
    </Surface>
  );
}
