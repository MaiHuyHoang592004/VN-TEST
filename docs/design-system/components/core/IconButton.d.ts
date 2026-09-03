/**
 * A square or circular button holding a single stroke icon. Always needs `label`
 * — it is the accessible name and the tooltip.
 */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "ghost" | "outline" | "filled" | "cream";
  /** `lg` (44px) is the minimum on touch surfaces. */
  size?: "sm" | "md" | "lg";
  shape?: "rounded" | "circle";
  /** Required — accessible name and tooltip text. */
  label: string;
  /** Notification count rendered as an orange pip (navy figure — white on orange-500 is 2.5:1). */
  badge?: number | string;
  active?: boolean;
  children?: React.ReactNode;
}
export function IconButton(props: IconButtonProps): JSX.Element;
