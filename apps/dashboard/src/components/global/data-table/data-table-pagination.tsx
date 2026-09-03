"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Offset pagination with an explicit total.
 *
 * ponytail: offset, not cursor. Admin lists are filtered and rarely deep, and
 * "page 4 of 12" is what admins expect. Ceiling: on a list that mutates while
 * being paged, offset can repeat or skip a column, and it degrades past ~100k
 * rows. Upgrade path when either bites: swap this for a cursor and change
 * useTableParams — the DataTable itself is unaffected.
 */
export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  selectedCount = 0,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  selectedCount?: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-column sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">
        {selectedCount > 0
          ? `${selectedCount} selected`
          : total === 0
            ? "No results"
            : `${first}–${last} of ${total}`}
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <Select
            value={String(pageSize)}
            onValueChange={(v) => v && onPageSizeChange(Number(v))}
          >
            <SelectTrigger size="sm" className="w-[4.5rem]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <span className="text-muted-foreground px-1 text-sm whitespace-nowrap">
          {page} / {pageCount}
        </span>

        <Button
          product="outline"
          size="icon"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          product="outline"
          size="icon"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
