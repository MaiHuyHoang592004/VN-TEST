/**
 * Methodology-first chart card for the Reports & Analytics module: states the
 * question the chart answers and the real fields it's built from before the
 * chart body. No chart-rendering of its own — pass the chart as children.
 *
 * DOMAIN-BOUND note: `fields` must name real backend fields the chart actually
 * consumes. Never list a field to make a chart look better-grounded than it
 * is — see SellerCharts.html for the pattern of naming exactly what's missing
 * for a chart that can't be built yet.
 */
export interface ChartFrameProps {
  title: React.ReactNode;
  /** The question this chart answers, e.g. "Which shipping model is cheaper, and from what quantity?" */
  ask?: React.ReactNode;
  /** Real source fields, shown as mono chips. */
  fields?: string[];
  /** One computed-metric caption, e.g. "derived: order spend ÷ order count, weekly". */
  derived?: React.ReactNode;
  /** Small controls scoped to this chart (a projection toggle, a legend). */
  tools?: React.ReactNode;
  /** A current-value readout pinned to the top-right. */
  readout?: React.ReactNode;
  children?: React.ReactNode;
  foot?: React.ReactNode;
}
export function ChartFrame(props: ChartFrameProps): JSX.Element;
