/**
 * Loading placeholders. Skeletons are pale sky, never grey. The brand ring
 * loader is reserved for full-surface waits.
 */
export interface LoadingStateProps {
  /** `rows` = table skeleton, `cards` = grid skeleton, `brand` = Wood Ring loader. */
  variant?: "rows" | "cards" | "brand";
  /** Number of skeleton rows or cards. Match the real page size where you can. */
  rows?: number;
  /** Announced status text for the `brand` variant. */
  label?: string;
}
export function LoadingState(props: LoadingStateProps): JSX.Element;
