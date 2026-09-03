"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { FormDialog, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  deleteVariantAction,
  getVariantUsageAction,
  setVariantStatusAction,
} from "@/modules/catalog/variants/actions";

import type { VariantRow } from "./variant-dialog";

type Usage = { skus: number; orders: number; canDelete: boolean };

/** Delete, or archive when SKUs or orders still point at the product. */
export function DeleteVariantDialog({
  product,
  open,
  onOpenChange,
}: {
  product: VariantRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getVariantUsageAction(product.id).then((u) => {
      if (!cancelled) setUsage(u as Usage);
    });
    return () => {
      cancelled = true;
    };
  }, [open, product.id]);

  const canDelete = usage?.canDelete ?? false;

  const { submit, pending, formError } = useFormAction({
    action: () =>
      canDelete
        ? deleteVariantAction(product.id)
        : setVariantStatusAction(product.id, "ARCHIVED"),
    successMessage: t(canDelete ? "catalog.variants.delDeleted" : "catalog.variants.delArchived"),
    errorMessages: { "in-use": t("catalog.variants.delInUse") },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  const pills = usage
    ? ([
        [t("catalog.variants.pillSkus"), usage.skus],
        [t("catalog.variants.pillOrders"), usage.orders],
      ] as const).filter(([, n]) => n > 0)
    : [];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(canDelete ? "catalog.variants.delTitle" : "catalog.variants.delArchiveTitle")}
      description={`${product.name} — ${product.key}`}
      submitLabel={t(canDelete ? "admin.actions.delete" : "catalog.products.archive")}
      destructive
      pending={pending || !usage}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      {!usage ? (
        <p className="text-muted-foreground text-sm">{t("catalog.variants.delChecking")}</p>
      ) : canDelete ? (
        <p className="text-muted-foreground text-sm">{t("catalog.variants.delSafe")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">{t("catalog.variants.delInUse")}</p>
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
