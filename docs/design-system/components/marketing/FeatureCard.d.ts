/**
 * Marketing value-proposition card: tinted icon chip, display-face title, body copy.
 */
export interface FeatureCardProps {
  /** 22–24px Lucide stroke icon. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** Body copy — two sentences maximum. */
  children?: React.ReactNode;
  tone?: "action" | "sky" | "accent" | "cream";
  align?: "left" | "center";
}
export function FeatureCard(props: FeatureCardProps): JSX.Element;
