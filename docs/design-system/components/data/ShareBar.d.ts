/**
 * Share-of-total bar for status breakdowns (Order Summary, product mix, stock mix).
 *
 * Encodes `value / total` — SHARE OF TOTAL — matching `status_report` from
 * `report.service.generateSingleCustomerReport()` and the `pct` formula in
 * `SellerDashboard.jsx`. Do NOT pass the largest single value as `total`: a
 * share-of-largest bar looks almost identical and means something else.
 *
 * The track is `--navy-400` (3.4:1 on white) because a paler step vanishes
 * against the data surface, and a non-zero share gets a 2px floor so it can
 * never render as a sub-pixel sliver.
 */
export interface ShareBarProps {
  /** This row's count. */
  value?: number;
  /** Sum across ALL rows — not the maximum. */
  total?: number;
  width?: number | string;
  height?: number;
  tone?: "action" | "navy" | "success";
  /** Accessible label. Defaults to "N% of total". */
  label?: string;
  style?: React.CSSProperties;
}
export function ShareBar(props: ShareBarProps): JSX.Element;
