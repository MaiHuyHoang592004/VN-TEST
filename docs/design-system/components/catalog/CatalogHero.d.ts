/**
 * The catalog hero — compact and branded, so the product grid below stays the
 * focal point. Never as tall as a marketing hero.
 */
export interface CatalogHeroProps {
  /** Breadcrumb node, e.g. `<a href="/">Home</a> › Products`. */
  breadcrumb?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** A `<SearchField shape="pill" size="lg" width="100%" />`. */
  search?: React.ReactNode;
  /** Workshop line art or a small product still-life. */
  art?: React.ReactNode;
}
export function CatalogHero(props: CatalogHeroProps): JSX.Element;
