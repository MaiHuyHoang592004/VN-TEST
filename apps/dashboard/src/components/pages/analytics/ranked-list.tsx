"use client";

import { Surface } from "@/components/ds";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";


export type RankedRow = { label: string; orders: number; quantity: number };

/**
 * A ranked breakdown: the label, its number, and a bar sized relative to the
 * top row so the eye reads the ranking. One div and a width — no chart
 * dependency, and nothing here is interpolated or zero-filled.
 *
 * Labels are SKUs and artwork names, so they are set in mono: machine truth,
 * per DS rule 4.
 */
export function RankedList({
  title,
  subtitle,
  rows,
  empty,
  mono = true,
}: {
  title: string;
  subtitle?: string;
  rows: RankedRow[];
  empty: string;
  /** SKUs and artwork names are machine truth and stay mono; a person's name
   * is not — "if a human wrote it, it is not mono" (DS rule 4). */
  mono?: boolean;
}) {
  const { t } = useTranslation();
  const top = rows[0]?.quantity ?? 0;

  return (
    <Surface title={title} subtitle={subtitle}>
      {rows.length === 0 ? (
        <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {/* Index in the key, not the label alone: two sellers can share a
              display name, and a duplicate key collapses them into one row. */}
          {rows.map((row, i) => (
            <li key={`${i}-${row.label}`} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-(length:--fs-body-sm)">
                <span
                  className={cn(
                    "truncate text-(--text-body)",
                    mono
                      ? "font-mono text-(length:--fs-meta)"
                      : "font-sans text-(length:--fs-body-sm)"
                  )}
                >
                  {row.label}
                </span>
                <span className="shrink-0 tabular-nums text-(--text-body)">
                  {row.quantity.toLocaleString()}
                  <span className="ml-2 text-(length:--fs-meta) text-(--text-muted)">
                    {row.orders.toLocaleString()} {t("analytics.ordersWord")}
                  </span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-(--surface-inset)">
                <div
                  className="h-full rounded-full bg-(--action-500)"
                  style={{ width: `${top ? (row.quantity / top) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
