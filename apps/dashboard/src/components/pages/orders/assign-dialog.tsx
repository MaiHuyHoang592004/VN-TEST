"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialog, FormField, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  assignOrdersAction,
  previewAssignmentAction,
} from "@/modules/fulfillment/orders/actions";
import { money } from "@/lib/money";

type Preview = {
  skipped: number;
  sellers: {
    sellerId: string;
    name: string;
    orders: number;
    charge: string;
    balanceBefore: string;
    balanceAfter: string;
    affordable: boolean;
  }[];
};

/**
 * Assign to a customer and charge the sellers.
 *
 * This is the only screen in the app that spends someone else's money, so it
 * shows the arithmetic BEFORE committing: per seller, what they are charged and
 * what their balance becomes. The preview runs through the same effectivePrice
 * the charge does — a preview computed a second way is one that eventually
 * lies.
 *
 * There is no "reason" field: the charge IS the reason. The idempotency key is
 * generated once when the dialog opens, so a double-click or a retry reuses it
 * and the database refuses the second charge.
 */
export function AssignDialog({
  orderIds,
  warehouses,
  open,
  onOpenChange,
  onDone,
}: {
  orderIds: number[];
  warehouses: { id: number; code: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  /**
   * ONE warehouse means there is no choice to make, so the dialog opens with it
   * already picked and the operator only confirms the charge.
   *
   * Deliberately `length === 1`, not "the first one": with two or more sites a
   * default would put a mis-assignment one careless click away, and an
   * assignment moves money and sends work to a physical building. The empty
   * field is the safeguard there, and `submitDisabled` already refuses a null.
   *
   * A lazy initialiser is enough — orders-table renders this dialog as
   * `{assigning && <AssignDialog …/>}`, so it remounts on every open and cannot
   * hold a stale selection from last time.
   */
  const [warehouseId, setWarehouseId] = useState<number | null>(
    warehouses.length === 1 ? warehouses[0].id : null,
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  // Generated ONCE per dialog. Regenerating per submit would defeat the point.
  const [idempotencyKey] = useState(() => `assign-${Date.now()}-${crypto.randomUUID()}`);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    previewAssignmentAction(orderIds).then((p) => {
      if (!cancelled) setPreview(p as Preview);
    });
    return () => {
      cancelled = true;
    };
  }, [open, orderIds]);

  const unaffordable = preview?.sellers.some((s) => !s.affordable) ?? false;

  const { submit, pending, formError } = useFormAction({
    action: async () => {
      const result = await assignOrdersAction({ orderIds, warehouseId, idempotencyKey });
      // The batch no longer dies on the first seller's failure — every OTHER
      // seller still got assigned and charged. Whoever failed needs naming,
      // not just a generic "something went wrong" for a run that mostly worked.
      if (result && "ok" in result && result.ok && result.errors?.length) {
        const nameOf = (id: string) => preview?.sellers.find((s) => s.sellerId === id)?.name ?? id;
        const reasonOf = (code: string) =>
          code === "insufficient-balance"
            ? t("orders.assignErrBalance")
            : code === "bom-line-unmapped"
              ? t("orders.assignErrBom")
              : t("orders.assignErrStock");
        toast.warning(
          t("orders.assignPartialHeader").replace("{count}", String(result.errors.length)) +
            " " +
            result.errors.map((e) => `${nameOf(e.sellerId)} (${reasonOf(e.error)})`).join(", "),
        );
      }
      return result;
    },
    successMessage: t("orders.assigned"),
    errorMessages: {
      "unknown-customer": t("orders.errUnknownWarehouse"),
    },
    onSuccess: () => {
      onOpenChange(false);
      onDone();
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("orders.assignTitle")}
      description={t("orders.assignDesc")}
      submitLabel={t("orders.assignSubmit")}
      pending={pending || !preview}
      submitDisabled={warehouseId === null || unaffordable || preview?.sellers.length === 0}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      <FormField label={t("orders.fWarehouse")} required>
        {(props) => (
          <Select
            value={warehouseId === null ? "" : String(warehouseId)}
            onValueChange={(v) => setWarehouseId(Number(v))}
          >
            <SelectTrigger {...props}>
              <SelectValue>
                {warehouses.find((w) => w.id === warehouseId)?.name ?? t("orders.pickWarehouse")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={String(w.id)}>
                  {w.code} — {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      {!preview ? (
        <p className="text-muted-foreground text-sm">{t("orders.assignCalculating")}</p>
      ) : preview.sellers.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("orders.assignNothing")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("orders.assignCharges")}</p>
          <div className="border-border divide-border divide-y overflow-hidden rounded-md border">
            {preview.sellers.map((s) => (
              <div key={s.sellerId} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {s.orders} {t("orders.ordersWord")}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="font-mono font-medium">−{money(s.charge)}</p>
                  <p
                    className={`font-mono text-xs ${
                      s.affordable ? "text-muted-foreground" : "text-destructive"
                    }`}
                  >
                    {money(s.balanceBefore)} → {money(s.balanceAfter)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {preview.skipped > 0 && (
            <p className="text-muted-foreground text-xs">
              {t("orders.assignSkipped").replace("{count}", String(preview.skipped))}
            </p>
          )}

          {unaffordable && (
            <div className="text-destructive flex items-start gap-2 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {/* The service rejects a seller's whole batch rather than
                  assigning half of it, so blocking here matches what would
                  actually happen. */}
              <span>{t("orders.assignUnaffordable")}</span>
            </div>
          )}
        </div>
      )}
    </FormDialog>
  );
}
