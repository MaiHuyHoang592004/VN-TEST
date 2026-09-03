"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n";
import { exportOrdersAction } from "@/modules/fulfillment/orders/actions";

/**
 * Export what is on screen: the current filter, or the selection when there is
 * one. The result is a LINK the browser fetches, not a streamed action
 * response — a 50k-column workbook is megabytes (same reason as the label bundle).
 */
export function ExportButton({ orderIds }: { orderIds: number[] }) {
  const params = useSearchParams();
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    const status = params.get("status");
    const result = await exportOrdersAction({
      ...(orderIds.length ? { ids: orderIds } : {}),
      ...(params.get("q") ? { search: params.get("q") } : {}),
      ...(status ? { status: [status] } : {}),
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
    <Button product="outline" onClick={run} disabled={pending}>
      {pending ? <Spinner className="size-4" /> : <Download className="size-4" />}
      {t("orders.export.action")}
      {orderIds.length > 0 ? ` (${orderIds.length})` : ""}
    </Button>
  );
}
