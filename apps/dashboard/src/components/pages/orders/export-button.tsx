"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n";
import { exportOrdersAction } from "@/modules/fulfillment/orders/actions";

import { readOrderFilter } from "./order-filters";

/**
 * Export what is on screen: the current filter, or the selection when there is
 * one. The result is a LINK the browser fetches, not a streamed action
 * response — a 50k-column workbook is megabytes (same reason as the label bundle).
 *
 * THE FILTER IS READ FROM ONE PLACE. This button used to build its own query
 * out of `?q` and `?status` and nothing else, so it never saw the tab chips,
 * the site or seller filters, or the date window: an operator standing on
 * "Needs attention" who pressed Export got a spreadsheet of every order in
 * every status, with no indication that the filter on screen had been ignored.
 * That is the same divergence `readOrderFilter` was written to close for
 * select-all, and rule 2 of the export service ("the export is the filter")
 * only holds while both sides read the one filter.
 */
export function ExportButton({ orderIds }: { orderIds: number[] }) {
  const params = useSearchParams();
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    // An explicit selection NARROWS the export; the filter still travels with
    // it, so the two intersect rather than the ids widening it back out to
    // rows the operator had filtered away.
    const result = await exportOrdersAction({
      ...readOrderFilter((key) => params.get(key)),
      ...(orderIds.length ? { ids: orderIds } : {}),
    });
    setPending(false);

    if (!result || result.ok === false) {
      toast.error(t("orders.export.failed"));
      return;
    }
    // A real anchor click: the file downloads with its name instead of opening
    // a tab the browser then has to guess about.
    const link = document.createElement("a");
    link.href = result.url;
    link.download = result.filename;
    link.click();

    toast.success(
      t(result.capped ? "orders.export.capped" : "orders.export.done")
        .replace("{rows}", String(result.rows))
        .replace("{total}", String(result.total)),
    );
  };

  return (
    <Button variant="outline" onClick={run} disabled={pending}>
      {pending ? <Spinner className="size-4" /> : <Download className="size-4" />}
      {t("orders.export.action")}
      {orderIds.length > 0 ? ` (${orderIds.length})` : ""}
    </Button>
  );
}
