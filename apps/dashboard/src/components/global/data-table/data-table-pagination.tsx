"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Fill {placeholders} in a translated string, wrapping each figure in <b> so
 * the parent can set mono on the numbers alone. Splitting on the placeholder
 * rather than concatenating keeps word order under the translator's control —
 * Japanese puts the total first, Arabic runs right to left.
 */
function Interpolate({
  text,
  values,
}: {
  text: string;
  values: Record<string, number>;
}) {
  const parts = text.split(/(\{[a-zA-Z]+\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const key = part.startsWith("{") && part.endsWith("}") ? part.slice(1, -1) : null;
        return key && key in values ? (
          <b key={i}>{values[key].toLocaleString()}</b>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

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
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Counts are machine truth, so the FIGURES are mono while the sentence
          around them stays sans — the design sets the range that way. The
          strings themselves were hardcoded English reaching all seven locales;
          they now come from common.pagination.* with the same {placeholder}
          convention the rest of the app uses. */}
      <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted) [&_b]:font-mono [&_b]:font-normal [&_b]:tracking-(--ls-mono) [&_b]:tabular-nums [&_b]:text-(--text-body)">
        {selectedCount > 0 ? (
          <Interpolate text={t("common.pagination.selected")} values={{ count: selectedCount }} />
        ) : total === 0 ? (
          t("common.pagination.empty")
        ) : (
          <Interpolate
            text={t("common.pagination.range")}
            values={{ first, last, total }}
          />
        )}
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <Select
            value={String(pageSize)}
            onValueChange={(v) => v && onPageSizeChange(Number(v))}
          >
            {/* 40px, matching the two arrow buttons beside it and the
                SearchField in the toolbar above — one --control-height rung
                across the whole table chrome. `size` stays explicit so the
                prop keeps emitting a real data-size. */}
            <SelectTrigger size="default" className="w-[4.5rem]" aria-label={t("common.pagination.rowsPerPage")}>
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

        {/* The design draws the current page as a filled Action Blue pill in
            mono. It draws 1 · 2 · 3 as separate pills, which is fine at three
            pages and unusable at two hundred — so the pill treatment is kept
            for the page you are ON and the total stays beside it. */}
        <span className="flex items-center gap-1 whitespace-nowrap">
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-(--radius-control) bg-(--action-500) px-2 font-mono text-(length:--fs-body-sm) tabular-nums text-(--gwp-white)">
            {page}
          </span>
          <span className="font-mono text-(length:--fs-body-sm) tabular-nums text-(--text-muted)">
            / {pageCount}
          </span>
        </span>

        <Button
          variant="outline"
          size="icon"
          aria-label={t("common.pagination.prev")}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("common.pagination.next")}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
