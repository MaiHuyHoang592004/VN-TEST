"use client";

import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useTableParams } from "@/components/global/data-table";
import { useTranslation } from "@/lib/i18n";

export type StatusSummaryRow = {
  status: string;
  orders: number;
  quantity: number;
  items: { variant: string; sku: string | null; orders: number; quantity: number }[];
};

/**
 * The card strip a customer works from: one card per status, count and units,
 * click to filter the table below.
 *
 * Every number is the server's groupBy over the same scope the table uses —
 * legacy summed the page it had rendered, so the cards changed as you paged.
 * The popover answers the next question without a navigation: WHAT is in that
 * status, by variant.
 */
export function StatusSummary({ rows }: { rows: StatusSummaryRow[] }) {
  const params = useTableParams();
  const { t } = useTranslation();
  const [openStatus, setOpenStatus] = useState<string | null>(null);
  const active = params.get("status");

  if (!rows.length) return null;

  return (
    // ONE ROW, all eight statuses. A fixed-row grid wrapped its tail onto
    // a second column (6 + 2), and a flex strip with a 128px floor per card just
    // scrolled instead — eight of those need more width than the page has.
    // So the cards share the column (flex-1) and are small enough that eight fit:
    // ~118px each at 1280, which is why the label is 11px and the count and
    // units sit on ONE line. Below ~800px the strip scrolls sideways rather
    // than stacking, the same contract the tab column keeps. p-px keeps the
    // active card's ring from being shaved by the scroll clip.
    <div className="scrollbar-none mb-4 flex gap-2 overflow-x-auto p-px">
      {rows.map((column) => (
        <Popover
          key={column.status}
          open={openStatus === column.status}
          onOpenChange={(open) => setOpenStatus(open ? column.status : null)}
        >
          <PopoverTrigger
            render={
              <button
                type="button"
                // Click filters; the card is a filter chip that happens to
                // carry its own numbers.
                onClick={() =>
                  params.setFilter("status", active === column.status ? "" : column.status)
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  setOpenStatus(column.status);
                }}
                className={`border-border bg-card hover:border-foreground/30 flex min-w-24 flex-1 flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  active === column.status ? "border-foreground/40 ring-ring/40 ring-1" : ""
                }`}
              />
            }
          >
            {/* The status name as plain text, not a Badge: the chip's own
                padding cost ~20px per card, which is the difference between
                eight fitting and six. The table below still badges each column. */}
            <span
              className="text-muted-foreground truncate text-[11px] leading-4"
              title={t(`orders.statuses.${column.status}`)}
            >
              {t(`orders.statuses.${column.status}`)}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-base leading-tight font-semibold tabular-nums">
                {column.orders.toLocaleString()}
              </span>
              <span className="text-muted-foreground truncate text-[10px] tabular-nums">
                {column.quantity.toLocaleString()} {t("orders.summary.units")}
              </span>
            </span>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-72">
            <p className="text-sm font-medium">{t("orders.summary.breakdown")}</p>
            {/* The same rule the sidebar draws, sitting IN the gap that was
                already there (mb-2 became my-2) — a divider that adds height
                just makes the popover taller for nothing. */}
            <Separator className="my-2" />
            {column.items.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("orders.summary.nothing")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {column.items.map((item) => (
                  <li
                    key={`${item.variant}-${item.sku}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{item.variant}</span>
                      {item.sku && (
                        <span className="text-muted-foreground block truncate font-mono text-xs">
                          {item.sku}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {item.quantity}
                      <span className="text-muted-foreground ml-1 text-xs">
                        / {item.orders}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}
