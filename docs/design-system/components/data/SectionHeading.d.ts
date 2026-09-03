/**
 * Bare title + note + right-aligned action row for content sitting directly
 * on a surface, outside Surface's own title/subtitle/action slots.
 */
export interface SectionHeadingProps {
  title: React.ReactNode;
  note?: React.ReactNode;
  right?: React.ReactNode;
  size?: "sm" | "md";
}
export function SectionHeading(props: SectionHeadingProps): JSX.Element;
