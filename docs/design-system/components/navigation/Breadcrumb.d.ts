/**
 * Slim trail + prev/next strip for a detail screen nested under a list
 * (Product Detail) instead of owning a full PageHero. Previously deferred in
 * guidelines/ALIGNMENT_AUDIT.md (O2) for lack of a using screen; SellerProductDetail
 * now is one.
 */
export interface BreadcrumbProps {
  trail: Array<{ label: React.ReactNode; onClick?: () => void }>;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
}
export function Breadcrumb(props: BreadcrumbProps): JSX.Element;
