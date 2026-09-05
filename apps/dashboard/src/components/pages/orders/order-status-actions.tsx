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
import { FormDialog } from "@/components/global/form";
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
  /** Set when CANCELLED is picked: the move waits on a confirmation, the same
   * as Delete and Refund. Cancelling a batch of orders is not undoable from
   * this menu — CANCELLED has no transition back to PENDING — so it does not
   * get to be a one-click item sitting next to the routine moves. */
  const [confirming, setConfirming] = useState(false);

  if (selected.length === 0) return null;

  const picked = rows.filter((r) => selected.includes(r.id));
  const common = picked.reduce<FulfillmentStatus[] | null>((acc, column) => {
    const next = allowedTransitions(column.status as FulfillmentStatus);
    return acc === null ? next : acc.filter((s) => next.includes(s));
  }, null);

  const options = common ?? [];

  const move = async (to: FulfillmentStatus) => {
    setPending(true);
    try {
      const results = await Promise.all(selected.map((id) => updateStatusAction(id, to)));

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
    } catch {
      // One rejected action used to escape Promise.all and skip the
      // setPending(false) below it, leaving the trigger disabled for good with
      // nothing on screen saying why.
      toast.error(t("orders.statusFailed"));
    } finally {
      setPending(false);
    }
  };

  /** CANCELLED asks first; everything else is a routine move. */
  const pick = (to: FulfillmentStatus) => {
    if (to === "CANCELLED") setConfirming(true);
    else void move(to);
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
                onClick={() => pick(s)}
              >
                {t(`orders.statuses.${s}`)}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {confirming && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setConfirming(false)}
          title={t("orders.cancelTitle")}
          description={t("orders.cancelDesc")}
          submitLabel={t("orders.cancelSubmit")}
          destructive
          pending={pending}
          onSubmit={() => {
            setConfirming(false);
            void move("CANCELLED");
          }}
        >
          <p className="text-muted-foreground text-sm">
            {t("orders.cancelBody").replace("{count}", String(selected.length))}
          </p>
        </FormDialog>
      )}
    </Can>
  );
}
