/**
 * In-page tabs. `underline` for primary sectioning inside a data surface
 * (All Products / Active SKUs / BOMs); `pill` for secondary switches.
 */
export interface TabBarProps {
  /** Labels, or `{ label, count, tone }`. `tone` marks the ONE tab that demands action. */
  tabs?: Array<string | { label: string; count?: number | string; tone?: "critical" | "attention" }>;
  active?: string;
  onChange?: (label: string) => void;
  variant?: "underline" | "pill";
  /** Node pinned to the right end of the tab row — usually a primary Button. */
  right?: React.ReactNode;
}
export function TabBar(props: TabBarProps): JSX.Element;
