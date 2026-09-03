/**
 * FilterChip trigger + Popover shell around a From/To date pair. Covers the
 * "custom date range" filter used on the dashboard period switch and the
 * Orders date filter — both hand-built the same popover independently before
 * this existed.
 */
export interface DateRangeFieldProps {
  value?: { from: string; to: string } | null;
  onChange?: (value: { from: string; to: string } | null) => void;
  placeholder?: string;
  fromLabel?: string;
  toLabel?: string;
  applyLabel?: string;
  cancelLabel?: string;
  /** Custom label for the applied range, e.g. locale-specific short dates. */
  formatValue?: (from: string, to: string) => string;
}
export function DateRangeField(props: DateRangeFieldProps): JSX.Element;
