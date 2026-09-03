"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { FormDialog, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  deleteProductAction,
  getProductUsageAction,
  setProductStatusAction,
} from "@/modules/catalog/products/actions";

import type { ProductRow } from "./product-dialog";

type Usage = { skus: number; orders: number; allowedUsers: number; canDelete: boolean };

/**
 * Delete, or archive when the variant is in use.
 *
 * Asks the server what references the variant BEFORE offering delete, and
 * switches itself to "Archive" when the answer isn't zero — showing the counts,
 * so the refusal is explained rather than merely enforced. A variant with
 * orders behind it must keep resolving its name on those orders forever.
 */
export function DeleteProductDialog({
  variant,
  open,
  onOpenChange,
}: {
  variant: ProductRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getProductUsageAction(variant.id).then((u) => {
      if (!cancelled) setUsage(u as Usage);
    });
    return () => {
      cancelled = true;
    };
  }, [open, variant.id]);

  const canDelete = usage?.canDelete ?? false;

  const { submit, pending, formError } = useFormAction({
    action: () =>
      canDelete
        ? deleteProductAction(variant.id)
        : setProductStatusAction(variant.id, "ARCHIVED"),
    successMessage: t(canDelete ? "catalog.products.delDeleted" : "catalog.products.delArchived"),
    errorMessages: { "in-use": t("catalog.products.delInUse") },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  const pills = usage
    ? ([
        [t("catalog.products.pillSkus"), usage.skus],
        [t("catalog.products.pillOrders"), usage.orders],
        [t("catalog.products.pillPartners"), usage.allowedUsers],
      ] as const).filter(([, n]) => n > 0)
    : [];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(canDelete ? "catalog.products.delTitle" : "catalog.products.delArchiveTitle")}
      description={`${variant.name} — ${variant.key}`}
      submitLabel={t(canDelete ? "admin.actions.delete" : "catalog.products.archive")}
      destructive
      pending={pending || !usage}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      {!usage ? (
        <p className="text-muted-foreground text-sm">{t("catalog.products.delChecking")}</p>
      ) : canDelete ? (
        <p className="text-muted-foreground text-sm">{t("catalog.products.delSafe")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">{t("catalog.products.delInUse")}</p>
          <div className="flex flex-wrap gap-1.5">
            {pills.map(([label, n]) => (
              <Badge key={label} variant="secondary">
                {n} {label}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </FormDialog>
  );
}
