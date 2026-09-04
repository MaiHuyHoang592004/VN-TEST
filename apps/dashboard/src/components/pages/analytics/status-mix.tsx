"use client";

import { StatusBadge, Surface } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";


/**
 * How the orders in scope are spread across the fulfillment map.
 *
 * The colour of each row comes from the raw backend status through
 * StatusBadge, never from a ternary here — one meaning, one colour, app-wide.
 * The visible label stays the translated string, because the enum value itself
 * is data and is never translated.
 */
export function StatusMix({
  rows,
  total,
}: {
  rows: { status: string; count: number }[];
  total: number;
}) {
  const { t } = useTranslation();

  return (
    <Surface
      title={t("analytics.statusMix.title")}
      subtitle={t("analytics.statusMix.subtitle")}
      action={
        <span className="font-mono text-(length:--fs-body-sm) tabular-nums text-(--text-muted)">
          {total.toLocaleString()}
        </span>
      }
    >
      {rows.length === 0 ? (
        <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">
          {t("analytics.statusMix.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const share = total ? (row.count / total) * 100 : 0;
            return (
              <li key={row.status} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 text-(length:--fs-body-sm)">
                  <StatusBadge status={row.status}>
                    {t(`orders.statuses.${row.status}`)}
                  </StatusBadge>
                  <span className="shrink-0 tabular-nums text-(--text-body)">
                    {row.count.toLocaleString()}
                    <span className="ml-2 text-(length:--fs-meta) text-(--text-muted)">
                      {share.toFixed(0)}%
                    </span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-(--surface-inset)">
                  <div
                    className="h-full rounded-full bg-(--action-500)"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}
