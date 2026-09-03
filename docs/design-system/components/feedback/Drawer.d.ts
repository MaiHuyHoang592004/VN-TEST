/**
 * Side panel for order detail, filters, and edit forms. GWP prefers a drawer
 * over a centred modal for anything with more than two fields.
 */
export interface DrawerProps {
  open?: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** 420 for filters, 480–560 for detail, 720 for order edit. */
  width?: number | string;
  side?: "right" | "left";
  /** Action buttons, right-aligned on a white footer bar. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}
export function Drawer(props: DrawerProps): JSX.Element | null;
