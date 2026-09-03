/**
 * Ticket list panel — the left rail of the Tickets screen and the
 * "Recent Tickets" dashboard block.
 */
export interface SupportPanelItem {
  /** Ticket reference, e.g. "#9567" — rendered in mono. */
  id: string;
  /** Related order reference, e.g. "Order #10429". */
  reference?: string;
  subject: string;
  /** Relative time, e.g. "10m ago". */
  time?: string;
  /** A `<StatusBadge />` node for the ticket state. */
  badge?: React.ReactNode;
}
export interface SupportPanelProps {
  title?: React.ReactNode;
  /** Header-right node — a Select for sort order, or a link. */
  action?: React.ReactNode;
  items?: SupportPanelItem[];
  activeId?: string;
  onSelect?: (item: SupportPanelItem) => void;
  /** Footer node — usually a "View all tickets" link or ghost Button. */
  footer?: React.ReactNode;
}
export function SupportPanel(props: SupportPanelProps): JSX.Element;
