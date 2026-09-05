"use client";

import { useState } from "react";
import { List } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useTableParams } from "@/components/global/data-table";
import { MetricCard, toneFor } from "@/components/ds";
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
        // The card and the breakdown are TWO controls, not one. The card
        // filters; the small button opens the breakdown. They were the same
        // element once, opened only by `contextmenu` — no keyboard path at all,
        // and iOS Safari never fires that event on a long press, so on a phone
        // the breakdown was simply unreachable. The card also carried the
        // popover's aria-expanded while its click filtered, so AT announced a
        // state the primary action never changed.
        <div key={column.status} className="relative flex min-w-24 flex-1">
          {/* The tone comes from the same STATUS_TONES map the table's badges
              read, so a status is one colour in both places. */}
          <MetricCard
            tone={toneFor(column.status)}
            // Click filters; the card is a filter chip that happens to
            // carry its own numbers.
            onClick={() =>
              params.setFilter("status", active === column.status ? "" : column.status)
            }
            title={t(`orders.statuses.${column.status}`)}
            label={t(`orders.statuses.${column.status}`)}
            value={column.orders.toLocaleString()}
            deltaNote={`${column.quantity.toLocaleString()} ${t("orders.summary.units")}`}
            // pe-7 keeps the label off the trigger sitting in the corner.
            className={`w-full p-2.5 pe-7 ${
              active === column.status ? "shadow-(--shadow-focus)" : ""
            }`}
          />

          <Popover
            open={openStatus === column.status}
            onOpenChange={(open) => setOpenStatus(open ? column.status : null)}
          >
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={t("orders.summary.breakdownFor").replace(
                    "{status}",
                    t(`orders.statuses.${column.status}`),
                  )}
                  title={t("orders.summary.breakdown")}
                  className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-(--radius-xs) text-(--text-muted) transition-colors duration-(--dur-fast) hover:text-(--text-body) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
                />
              }
            >
              <List className="size-3.5" aria-hidden />
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
        </div>
      ))}
    </div>
  );
}
