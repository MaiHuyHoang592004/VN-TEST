/**
 * Search Component Types
 * Shared type definitions for search components.
 * Adapted from the instrument search: results are orders and products.
 */

export type SearchResultType = "order" | "variant" | "user" | "page";

export interface SearchProps {
  /**
   * Variant of the search component
   * - "dropdown": Shows results below search box in navbar context (default)
   * - "modal": Shows full-page command palette modal
   */
  product?: "dropdown" | "modal";
  /**
   * For mobile: Controls if search is visible
   */
  mobileExpanded?: boolean;
  /**
   * Callback when mobile search should close
   */
  onMobileClose?: () => void;
  /** Input stretches to its container (sidebar) instead of sm:w-72 */
  fullWidth?: boolean;
  /** Dropdown anchor edge — "left" lets it extend past a narrow container */
  anchor?: "left" | "right";
}

export interface SearchResult {
  id: string;
  /** Short identifier shown as secondary text (SKU / order number) */
  code: string;
  /** Display name (variant name / order title) */
  name: string;
  /** Result kind — drives icon and navigation target */
  type: SearchResultType;
  /** Category tag (variant category / order status) */
  category: string;
  /** Where selecting it navigates. Decided by the server, which is the only
   * side that knows what route a column actually lives at (doc 07 D2). */
  href: string;
}

export interface RecentSearch extends SearchResult {
  timestamp: number;
}
