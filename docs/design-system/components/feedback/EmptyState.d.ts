/**
 * Empty / zero-result state. The one context where Wood Rings sit centred
 * behind content, because there is no data to compete with.
 */
export interface EmptyStateProps {
  /** Short, warm, specific — "No orders yet", not "Empty". */
  title: React.ReactNode;
  /** One sentence saying what to do next. */
  children?: React.ReactNode;
  /** Workshop line-art illustration node. */
  art?: React.ReactNode;
  /** A single Button — the next step, never two competing ones. */
  action?: React.ReactNode;
  /** `sm` inside a table body; `md` for a whole page region. */
  size?: "sm" | "md";
  rings?: boolean;
}
export function EmptyState(props: EmptyStateProps): JSX.Element;
