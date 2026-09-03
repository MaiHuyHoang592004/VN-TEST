"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { FormDialog, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  deleteWarehouseAction,
  setWarehouseStatusAction,
} from "@/modules/inventory/warehouses/actions";
import { getWarehouseUsageAction } from "@/modules/inventory/warehouses/actions";

import type { WarehouseRow } from "./warehouse-dialog";

type Usage = {
  members: number;
  orders: number;
  inventory: number;
  stockImports: number;
  canDelete: boolean;
};

/**
 * Delete, or deactivate when the customer is in use.
 *
 * The dialog asks the server what references the site BEFORE offering delete,
 * and switches itself to "Deactivate" when the answer isn't zero — showing the
 * counts so the refusal is explained rather than just enforced. Deleting a site
 * that still holds orders and stock would orphan them.
 */
export function DeleteWarehouseDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: WarehouseRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getWarehouseUsageAction(customer.id).then((u) => {
      if (!cancelled) setUsage(u as Usage);
    });
    return () => {
      cancelled = true;
    };
  }, [open, customer.id]);

  const canDelete = usage?.canDelete ?? false;

  const { submit, pending, formError } = useFormAction({
    action: () =>
      canDelete
        ? deleteWarehouseAction(customer.id)
        : setWarehouseStatusAction(customer.id, "INACTIVE"),
    successMessage: t(canDelete ? "admin.warehouses.delDeleted" : "admin.warehouses.delDeactivated"),
    errorMessages: { "in-use": t("admin.warehouses.delInUse") },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  const pills = usage
    ? ([
        [t("admin.warehouses.pillStaff"), usage.members],
        [t("admin.warehouses.pillOrders"), usage.orders],
        [t("admin.warehouses.pillInventory"), usage.inventory],
        [t("admin.warehouses.pillImports"), usage.stockImports],
      ] as const).filter(([, n]) => n > 0)
    : [];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(canDelete ? "admin.warehouses.delTitle" : "admin.warehouses.delDeactivateTitle")}
      description={`${customer.code} — ${customer.name}`}
      submitLabel={t(canDelete ? "admin.actions.delete" : "admin.users.deactivate")}
      destructive
      pending={pending || !usage}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      {!usage ? (
        <p className="text-muted-foreground text-sm">{t("admin.warehouses.delChecking")}</p>
      ) : canDelete ? (
        <p className="text-muted-foreground text-sm">
          {t("admin.warehouses.delSafe")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            {t("admin.warehouses.delInUse")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pills.map(([label, n]) => (
              <Badge key={label} product="secondary">
                {n} {label}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </FormDialog>
  );
}
