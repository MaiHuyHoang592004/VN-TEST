"use client";

import { useState, type ReactElement } from "react";
import { List } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useTableParams } from "@/components/global/data-table";
import { MetricCard, StatusBadge, toneFor } from "@/components/ds";
import { TERMINAL } from "@/modules/fulfillment/orders/status";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type StatusSummaryRow = {
  status: string;
  orders: number;
  quantity: number;
  items: { variant: string; sku: string | null; orders: number; quantity: number }[];
};

/**
 * The card strip a customer works from: one status, count and units, click to
 * filter the table below.
 *
 * Every number is the server's groupBy over the same scope the table uses —
 * legacy summed the page it had rendered, so the cards changed as you paged.
 * The popover answers the next question without a navigation: WHAT is in that
 * status, by variant.
 *
 * TWO TIERS, AND THE REASON IS THE OLD ROW'S ARITHMETIC. Eight-plus statuses
 * shared one flex row at `flex-1`, which is about 118px per card at 1280 — so
 * the label had to be set at 11px, below comfortable reading size, and the
 * count and the units were squeezed onto one line. Worse than the cramping: it
 * gave REFUNDED and CANCELLED exactly the weight of PENDING. A terminal status
 * is a number you look up occasionally; the five statuses with work outstanding
 * are the ones an operator reads every time the page loads, and they were
 * competing with four that never change again.
 *
 * So the actionable statuses lead as full cards at a readable size, and the
 * settled ones sit underneath as a quiet row of badges — still counted, still
 * one click from filtering, still carrying their breakdown. Nothing was
 * removed; the row was given a hierarchy it did not have.
 */

/**
 * The lead, in the order the floor reads them: what is BLOCKED first, then the
 * queue in lifecycle order.
 *
 * These are FulfillmentStatus values, all nine of which are enumerated across
 * this constant and the derived tail — nothing here invents a state. ON_HOLD
 * leads because it is the one status that means a human stopped this order and
 * nothing moves it until another one acts.
 */
const LEAD: readonly string[] = [
  "ON_HOLD",
  "PENDING",
  "ASSIGNED",
  "IN_PRODUCTION",
  "FULFILLED",
];

/**
 * Everything else is settled: the three TERMINAL statuses read from status.ts
 * (DELIVERED, CANCELLED, REFUNDED — never restated here, so adding a fourth
 * terminal status demotes it automatically) plus SHIPPED, which is not terminal
 * but is out of the building and in the carrier's hands. There is nothing on
 * this screen to DO about any of them.
 */
const isSettled = (status: string) =>
  status === "SHIPPED" || (TERMINAL as readonly string[]).includes(status);

/** Lead first, in LEAD's order; then everything else. A status that is in
 * neither list — a new enum value nobody has told this file about — sorts to
 * the end of the lead group rather than disappearing, because a count nobody
 * can see is worse than one in the wrong place. */
function rank(status: string): number {
  const lead = LEAD.indexOf(status);
  if (lead >= 0) return lead;
  return isSettled(status) ? 100 : 50;
}

export function StatusSummary({ rows }: { rows: StatusSummaryRow[] }) {
  const params = useTableParams();
  const { t } = useTranslation();
  const [openStatus, setOpenStatus] = useState<string | null>(null);
  const active = params.get("status");

  if (!rows.length) return null;

  const ordered = [...rows].sort((a, b) => rank(a.status) - rank(b.status));
  const lead = ordered.filter((row) => !isSettled(row.status));
  const settled = ordered.filter((row) => isSettled(row.status));

  /** Click filters, and clicking the ACTIVE one clears it — the card is a
   * filter chip that happens to carry its own numbers. */
  const toggle = (status: string) =>
    params.setFilter("status", active === status ? "" : status);

  /**
   * The card and the breakdown are TWO controls, not one. The card filters; the
   * small button opens the breakdown. They were the same element once, opened
   * only by `contextmenu` — no keyboard path at all, and iOS Safari never fires
   * that event on a long press, so on a phone the breakdown was simply
   * unreachable. The card also carried the popover's aria-expanded while its
   * click filtered, so AT announced a state the primary action never changed.
   *
   * Both tiers share this so the keyboard path is identical whether a status is
   * leading or settled.
   */
  const breakdown = (column: StatusSummaryRow, trigger: ReactElement) => (
    <Popover
      open={openStatus === column.status}
      onOpenChange={(open) => setOpenStatus(open ? column.status : null)}
    >
      <PopoverTrigger render={trigger} />

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
                  <span className="text-muted-foreground ml-1 text-xs">/ {item.orders}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );

  const breakdownLabel = (status: string) =>
    t("orders.summary.breakdownFor").replace("{status}", t(`orders.statuses.${status}`));

  return (
    <div className="mb-4 flex flex-col gap-2">
      {/* A GRID, not a scrolling flex strip. Five cards across at desktop is
          ~215px each — enough for the label at its own size and for the count
          and the units to stop sharing a line — and the grid REFLOWS on a
          narrow screen instead of hiding four cards off the right edge, where
          the previous strip put them. p-px keeps the active card's focus ring
          from being shaved by the row below. */}
      {lead.length > 0 && (
        <div className="grid grid-cols-2 gap-2 p-px sm:grid-cols-3 lg:grid-cols-5">
          {lead.map((column) => (
            <div key={column.status} className="relative flex">
              {/* The tone comes from the same STATUS_TONES map the table's
                  badges read, so a status is one colour in both places. */}
              <MetricCard
                tone={toneFor(column.status)}
                onClick={() => toggle(column.status)}
                title={t(`orders.statuses.${column.status}`)}
                label={t(`orders.statuses.${column.status}`)}
                value={column.orders.toLocaleString()}
                deltaNote={`${column.quantity.toLocaleString()} ${t("orders.summary.units")}`}
                // pe-9 keeps the label clear of the trigger in the corner.
                className={cn(
                  "w-full p-3 pe-9",
                  active === column.status && "shadow-(--shadow-focus)",
                )}
              />

              {breakdown(
                column,
                <button
                  type="button"
                  aria-label={breakdownLabel(column.status)}
                  title={t("orders.summary.breakdown")}
                  className="absolute end-1 top-1 flex size-5 items-center justify-center rounded-(--radius-xs) text-(--text-muted) transition-colors duration-(--dur-fast) hover:text-(--text-body) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
                >
                  <List className="size-3.5" aria-hidden />
                </button>,
              )}
            </div>
          ))}
        </div>
      )}

      {/* THE SETTLED TAIL. Reachable, countable, and out of the way: a badge
          rather than a card, so shipped/delivered/cancelled/refunded read as a
          footnote to the strip instead of four more headline figures.

          The colour still comes from toneFor — through StatusBadge, which is
          the only component allowed to turn a status into a colour — so a
          settled status is the same red or green here, on its card yesterday,
          and in the row below. */}
      {settled.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 p-px">
          {settled.map((column) => (
            <span key={column.status} className="inline-flex items-center">
              <button
                type="button"
                aria-pressed={active === column.status}
                title={t(`orders.statuses.${column.status}`)}
                onClick={() => toggle(column.status)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-(--radius-pill) py-0.5 ps-0.5 pe-2",
                  "transition-colors duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none",
                  "hover:bg-sky-50 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none",
                  active === column.status && "bg-sky-100",
                )}
              >
                <StatusBadge status={column.status} size="sm">
                  {t(`orders.statuses.${column.status}`)}
                </StatusBadge>
                <span className="font-mono text-(length:--fs-body-sm) tabular-nums text-(--text-body)">
                  {column.orders.toLocaleString()}
                </span>
              </button>

              {breakdown(
                column,
                <button
                  type="button"
                  aria-label={breakdownLabel(column.status)}
                  title={t("orders.summary.breakdown")}
                  className="flex size-5 items-center justify-center rounded-(--radius-xs) text-(--text-muted) transition-colors duration-(--dur-fast) hover:text-(--text-body) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
                >
                  <List className="size-3.5" aria-hidden />
                </button>,
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
