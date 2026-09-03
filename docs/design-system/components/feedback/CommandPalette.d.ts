/**
 * ⌘K command palette — the admin shell's primary way across an IA of ~30 routes.
 * It owns its own hotkey (⌘K / Ctrl-K toggles), so a screen holds only `open`.
 * Pair it with `AdminBar.right` as a visible affordance; a palette nobody knows
 * about is not navigation. Selection is a sky FILL, never an underline.
 *
 * DOMAIN-BOUND: searching records (orders, SKUs, sellers) needs a real search
 * endpoint. Pass route items only until one exists — never fake result rows.
 */
export interface CommandPaletteItem {
  label: string;
  /** Section heading. Items are rendered in array order; keep same-group items adjacent. */
  group?: string;
  /** Right-aligned mono hint — a shortcut, a count, a route. */
  hint?: string;
  icon?: React.ReactNode;
}
export interface CommandPaletteProps {
  open?: boolean;
  /** Called with the next open state — by the hotkey, the scrim, esc, or a pick. */
  onOpenChange?: (open: boolean) => void;
  items?: CommandPaletteItem[];
  onSelect?: (item: CommandPaletteItem) => void;
  placeholder?: string;
  /** Set false to disable the built-in ⌘K/Ctrl-K listener. */
  hotkey?: boolean;
  emptyText?: string;
}
export function CommandPalette(props: CommandPaletteProps): JSX.Element | null;

/** The visible ⌘K affordance. Goes in `AdminBar.right` on every admin screen. */
export interface CommandTriggerProps {
  label?: string;
  onClick?: () => void;
  width?: number;
}
export function CommandTrigger(props: CommandTriggerProps): JSX.Element;
