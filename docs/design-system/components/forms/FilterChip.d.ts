/**
 * Pill-shaped filter toggle. The category row in Catalog and the quick-status
 * row above operational tables are both rows of these.
 */
export interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /**
   * Status tone for a quick-status row: a selected chip then wears that
   * status's own colour (`--status-<tone>-{bg,fg}`) instead of Action Blue.
   * Unselected chips stay neutral regardless.
   */
  tone?: "success" | "progress" | "pending" | "attention" | "critical" | "info" | "neutral";
  /** Result count shown in mono after the label. */
  count?: number | string;
  icon?: React.ReactNode;
  /** Renders an × on the selected chip. */
  onRemove?: () => void;
  children?: React.ReactNode;
}
export function FilterChip(props: FilterChipProps): JSX.Element;
