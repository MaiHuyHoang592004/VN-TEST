/**
 * Search input. `rounded` `md` in the top nav and above tables;
 * `pill` `lg` as the hero search in catalog.
 */
export interface SearchFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  size?: "sm" | "md" | "lg";
  shape?: "rounded" | "pill";
  /** Fixed width in px, or a CSS length. Pass "100%" to fill a search shell. */
  width?: number | string;
  /** Replace the default magnifier with a Lucide icon node. */
  icon?: React.ReactNode;
  /** When provided together with a value, shows a clear affordance. */
  onClear?: () => void;
  containerStyle?: React.CSSProperties;
}
export function SearchField(props: SearchFieldProps): JSX.Element;
