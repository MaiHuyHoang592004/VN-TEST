/**
 * Native-backed select styled to match Input. Also serves as the compact
 * toolbar dropdown above tables ("All Stores", "All Statuses", "Last 7 days").
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  /** Strings, or `{ value, label }` objects. */
  options?: Array<string | { value: string; label: string }>;
  size?: "sm" | "md" | "lg";
  width?: number | string;
  /** Leading icon — a calendar for date ranges, a store glyph for store filters. */
  icon?: React.ReactNode;
  containerStyle?: React.CSSProperties;
}
export function Select(props: SelectProps): JSX.Element;
