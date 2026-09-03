/**
 * One label/value line for a drawer or detail panel — value right-aligned,
 * mono for machine values (amounts, IDs, tracking numbers).
 */
export interface KeyValueRowProps {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
  tone?: "success" | "progress" | "info" | "pending" | "attention" | "critical" | "neutral";
}
export function KeyValueRow(props: KeyValueRowProps): JSX.Element;
