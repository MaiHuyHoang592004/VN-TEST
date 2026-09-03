/**
 * Compact 2-4 option switch — density and view-mode toggles. Distinct from
 * FilterChip (independent toggles, any number selected) and TabBar
 * (page-level navigation): this is one mutually-exclusive choice inside a
 * toolbar, e.g. Gọn/Vừa/Đầy đủ or Lưới/Bảng.
 */
export interface SegmentedControlProps {
  options: Array<string | { value: string; label: React.ReactNode }>;
  value: string;
  onChange?: (value: string) => void;
  size?: "sm" | "md";
}
export function SegmentedControl(props: SegmentedControlProps): JSX.Element;
