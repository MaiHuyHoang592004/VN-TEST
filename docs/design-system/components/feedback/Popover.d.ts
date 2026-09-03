/**
 * Anchor-positioned popover rendered into a portal at document.body. Use
 * whenever a dropdown or filter panel would otherwise sit inside an
 * overflow:hidden ancestor (PageHero, Surface, EmptyState all clip for their
 * own decoration) and get cut off — the underlying fix behind DateRangeField.
 */
export interface PopoverProps {
  open: boolean;
  onClose?: () => void;
  /** Ref to the trigger element the popover positions itself under. */
  anchorRef: React.RefObject<HTMLElement>;
  width?: number;
  align?: "left" | "right";
  offset?: number;
  children?: React.ReactNode;
}
export function Popover(props: PopoverProps): JSX.Element | null;
