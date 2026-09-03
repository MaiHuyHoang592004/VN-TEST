/**
 * Table pagination with an optional page-size control. Sits inside the white
 * data surface, below the last row, separated by a hairline.
 */
export interface PaginationProps {
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  /** Omit to hide the "Show N" control. */
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}
export function Pagination(props: PaginationProps): JSX.Element;
