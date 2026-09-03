/**
 * Centred dialog with scrim — confirmations, keyboard-shortcut references,
 * image zoom. Drawer stays the default for anything record-shaped; Modal is
 * for content with no meaningful side to slide in from.
 */
export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  width?: number | string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}
export function Modal(props: ModalProps): JSX.Element | null;
