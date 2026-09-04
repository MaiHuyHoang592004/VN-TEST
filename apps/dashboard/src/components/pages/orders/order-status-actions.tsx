"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import type { FulfillmentStatus } from "@gwprint/db";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Can } from "@/components/global/permission-gate";
import { useTranslation } from "@/lib/i18n";
// Imported from status.ts DIRECTLY, not through the domain index: that barrel
// also re-exports the order service, which pulls prisma and the pg driver into
// the client bundle ("Module not found: Can't resolve 'dns'"). status.ts is
// pure data with a type-only import, so it is safe in a client component —
// which is exactly why the transition map was built as data.
import { allowedTransitions } from "@/modules/fulfillment/orders/status";
import { updateStatusAction } from "@/modules/fulfillment/orders/actions";

import type { OrderRow } from "./orders-table";

/**
 * Bulk status moves on the selected rows.
 *
 * The menu is BUILT FROM the same transition map the service validates
 * against, so it cannot offer a move that will be rejected. Legacy let any
 * status be written over any other from any screen — an order could go from
 * DELIVERED back to PENDING and nothing would notice.
 *
 * Only transitions legal for EVERY selected order are offered: a mixed
 * selection where half are PENDING and half are SHIPPED shares no move, and
 * showing one would mean half the batch silently failing.
 */
export function OrderStatusActions({
  selected,
  rows,
  onDone,
}: {
  selected: number[];
  rows: OrderRow[];
  onDone: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);

  if (selected.length === 0) return null;

  const picked = rows.filter((r) => selected.includes(r.id));
  const common = picked.reduce<FulfillmentStatus[] | null>((acc, column) => {
    const next = allowedTransitions(column.status as FulfillmentStatus);
    return acc === null ? next : acc.filter((s) => next.includes(s));
  }, null);

  const options = common ?? [];

  const move = async (to: FulfillmentStatus) => {
    setPending(true);
    const results = await Promise.all(selected.map((id) => updateStatusAction(id, to)));
    setPending(false);

    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) {
      // A stale page is the only way to get here — the menu is built from the
      // map — so say which, rather than pretending it all worked.
      toast.error(
        t("orders.statusPartial")
          .replace("{failed}", String(failed))
          .replace("{total}", String(selected.length)),
      );
    } else {
      toast.success(
        t("orders.statusMoved")
          .replace("{count}", String(selected.length))
          .replace("{status}", t(`orders.statuses.${to}`)),
      );
    }
    onDone();
    router.refresh();
  };

  return (
    <Can permission="orders.status.update">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" disabled={pending || options.length === 0}>
              {t("orders.moveTo")} ({selected.length})
              <ChevronDown className="ml-1 size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {options.length === 0 ? (
            <DropdownMenuItem disabled>{t("orders.noCommonMove")}</DropdownMenuItem>
          ) : (
            options.map((s) => (
              <DropdownMenuItem
                key={s}
                variant={s === "CANCELLED" ? "destructive" : undefined}
                onClick={() => move(s)}
              >
                {t(`orders.statuses.${s}`)}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </Can>
  );
}
