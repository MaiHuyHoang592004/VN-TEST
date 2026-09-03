"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { FormDialog, FormField, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { bulkSetPricesAction } from "@/modules/catalog/product-variants/actions";

import { TIERS } from "./sku-grid";

/**
 * Fill one tier table across many SKUs — the select-many-price-once flow.
 *
 * REPLACES each selected SKU's table rather than merging into it, matching what
 * setPrices does for a single column: a tier left blank here is deleted there, so
 * "what this dialog shows is what those SKUs will have" holds literally.
 */
export function BulkPricesDialog({
  productId,
  skuIds,
  open,
  onOpenChange,
}: {
  productId: number;
  skuIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<number, string>>({});

  const { submit, pending, formError } = useFormAction({
    action: () =>
      bulkSetPricesAction(
        productId,
        skuIds,
        TIERS.map((tier) => ({ tier, price: values[tier] ?? "" })).filter(
          (p) => p.price.trim() !== "",
        ),
      ),
    successMessage: t("catalog.skus.bulkSaved"),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("catalog.skus.bulkTitle")}
      // t() takes a key only; the one placeholder here is filled the same way
      // the notification panel does it.
      description={t("catalog.skus.bulkDesc").replace("{count}", String(skuIds.length))}
      submitLabel={t("catalog.skus.bulkSubmit")}
      pending={pending}
      // Tier 0 is required by the service; disabling here says so before the
      // round-trip rather than after it.
      submitDisabled={!values[0]?.trim()}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {TIERS.map((tier) => (
          <FormField
            key={tier}
            label={tier === 0 ? t("catalog.skus.colBase") : `${t("catalog.skus.tier")} ${tier}`}
            required={tier === 0}
          >
            {(props) => (
              <Input
                {...props}
                value={values[tier] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [tier]: e.target.value }))}
                placeholder={tier === 0 ? "0.00" : "—"}
                inputMode="decimal"
                className="text-right font-mono tabular-nums"
              />
            )}
          </FormField>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{t("catalog.skus.bulkWarning")}</p>
    </FormDialog>
  );
}
