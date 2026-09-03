"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n";
import { downloadLabelsAction } from "@/modules/fulfillment/labels/actions";

/**
 * Fetch, merge and zip labels — the selected orders, or TODAY's when nothing is
 * selected.
 *
 * The no-selection default is the question a floor actually asks ("give me
 * today's labels"), and it was legacy's default too. Hiding this button behind
 * a selection made that unreachable.
 *
 * The result is a LINK, not a stream: the bundle can be tens of megabytes and
 * a Server Action response is the wrong pipe for that. It also means a failed
 * fetch does not lose the ones that worked — the zip carries a FAILED.txt and
 * this button says how many, rather than legacy's silent short zip.
 */
export function DownloadLabelsButton({ orderIds }: { orderIds: number[] }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    // No selection → no ids → the service falls back to today's date range.
    const result = await downloadLabelsAction(orderIds.length ? { orderIds } : {});
    setPending(false);

    if (!result.ok) {
      toast.error(t(`fulfillment.errors.${result.error}`));
      return;
    }
    if (!result.merged && !result.failed.length) {
      toast.message(t("orders.labels.noneToDownload"));
      return;
    }
    if (result.failed.length) {
      toast.warning(
        t("orders.labels.downloadedPartial")
          .replace("{ok}", String(result.merged))
          .replace("{failed}", String(result.failed.length)),
      );
    } else {
      toast.success(t("orders.labels.downloaded").replace("{count}", String(result.merged)));
    }
    window.open(result.url, "_blank", "noopener");
  };

  return (
    <Button variant="outline" onClick={run} disabled={pending}>
      {pending ? <Spinner className="size-4" /> : <Download className="size-4" />}
      {orderIds.length
        ? `${t("orders.labels.download")} (${orderIds.length})`
        : t("orders.labels.downloadToday")}
    </Button>
  );
}
