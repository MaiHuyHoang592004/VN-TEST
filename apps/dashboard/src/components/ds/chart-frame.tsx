import { cn } from "@/lib/utils";

import { Surface } from "./surface";

/**
 * The methodology-first chart card — ported from the design system's
 * `components/data/ChartFrame`.
 *
 * The DS comment for this component is explicit about why it exists: "state
 * the question the chart answers and the real fields it's built from before
 * showing a single pixel of chart." So the frame renders, in order, the
 * title, the `ask`, the mono `fields` chips + `derived` caption, then the
 * chart body, then the `foot` note. The frame owns all of that and the
 * height; the caller owns the chart. Series colours come from --chart-1…5
 * (mapped to GWP accents in globals.css), never from a literal passed at the
 * call site.
 *
 * DOMAIN-BOUND (ChartFrame.d.ts): `fields` must name real backend fields the
 * chart actually consumes. Never list a field to make a chart look
 * better-grounded than it is — if a chart needs a field the backend does not
 * expose, that is a reason to leave `fields` unset and say what is missing in
 * `foot`/`ask`, not to list the field anyway.
 *
 * NOTE (BE_ALIGNMENT.md): backend chart series are NOT zero-filled — a day
 * with no data is absent from the array rather than present as 0. This frame
 * does not fabricate the missing points, and neither should a caller.
 */
export type ChartFrameProps = {
  title: React.ReactNode;
  /** The question this chart answers, e.g. "Which shipping model is cheaper, and from what quantity?" */
  ask?: React.ReactNode;
  /** Real backend source fields, shown as mono chips. Never invented ones. */
  fields?: string[];
  /** One computed-metric caption, e.g. "derived: order spend ÷ order count, weekly". */
  derived?: React.ReactNode;
  /** Small controls scoped to this chart (a projection toggle, a legend). */
  tools?: React.ReactNode;
  /** A current-value readout pinned to the top-right. */
  readout?: React.ReactNode;
  /** Port extra: a plain caption under the ask, for frames with no question. */
  subtitle?: React.ReactNode;
  /** Port extra: a header-right control, rendered beside `tools`. */
  action?: React.ReactNode;
  /** Port extra: the fixed body height the chart draws into. */
  height?: number;
  children: React.ReactNode;
  foot?: React.ReactNode;
  className?: string;
};

export function ChartFrame({
  title,
  ask,
  fields,
  derived,
  tools,
  readout,
  subtitle,
  action,
  height = 280,
  children,
  foot,
  className,
}: ChartFrameProps) {
  return (
    <Surface
      level="data"
      radius="card"
      // The DS calls Surface with shadow="xs" here, not the surface default
      // of "sm": a chart card is a data panel, and lifting it as high as a
      // content card makes a grid of them read as a stack of separate pages.
      shadow="xs"
      className={cn("overflow-hidden", className)}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[200px] flex-1">
          {/*
            The DS renders this title as an <h3>, and so does the port — the
            frame no longer routes its title through Surface's <h2>, because a
            chart card sits UNDER a SectionHeading's <h2> and an <h2> here
            would flatten the page outline for a screen reader.
          */}
          <h3 className="font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong)">
            {title}
          </h3>
          {ask && (
            <p className="mt-1 font-sans text-(length:--fs-body-sm) text-(--text-muted)">
              {ask}
            </p>
          )}
          {subtitle && (
            <p className="mt-1 font-sans text-(length:--fs-body-sm) text-(--text-muted)">
              {subtitle}
            </p>
          )}
        </div>
        {(tools || action) && (
          <div className="flex shrink-0 items-center gap-2">
            {tools}
            {action}
          </div>
        )}
        {readout && <div className="shrink-0 text-right">{readout}</div>}
      </div>

      {(fields || derived) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {(fields ?? []).map((field) => (
            <span
              key={field}
              className="rounded-(--radius-pill) bg-(--surface-inset) px-2 py-0.5 font-mono text-(length:--fs-micro) text-navy-600"
            >
              {field}
            </span>
          ))}
          {derived && (
            <span className="px-2 py-0.5 font-sans text-(length:--fs-micro) text-(--text-muted)">
              {derived}
            </span>
          )}
        </div>
      )}

      <div style={{ height }} className="mt-4 w-full">
        {children}
      </div>

      {foot && (
        <p className="mt-3 font-sans text-(length:--fs-micro) leading-(--lh-body) text-(--text-muted)">
          {foot}
        </p>
      )}
    </Surface>
  );
}
