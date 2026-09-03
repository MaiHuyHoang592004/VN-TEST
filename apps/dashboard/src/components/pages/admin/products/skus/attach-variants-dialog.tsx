"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormDialog, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { attachVariantsAction } from "@/modules/catalog/product-variants/actions";

/**
 * Multi-select of variants NOT yet attached to this variant. The list is
 * already filtered server-side, so an existing pair cannot be picked at all —
 * the service's skip check is the backstop, not the UI's job.
 */
export function AttachVariantsDialog({
  productId,
  variants,
  open,
  onOpenChange,
}: {
  productId: number;
  variants: { id: number; name: string; key: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const toggle = (id: number) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { submit, pending, formError } = useFormAction({
    action: () => attachVariantsAction(productId, [...picked]),
    successMessage: t("catalog.skus.attached"),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("catalog.skus.attachTitle")}
      description={t("catalog.skus.attachDesc")}
      submitLabel={t("catalog.skus.attachSubmit")}
      pending={pending}
      submitDisabled={picked.size === 0}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {variants.map((v) => (
          <Label
            key={v.id}
            className="hover:bg-accent/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2"
          >
            <Checkbox checked={picked.has(v.id)} onCheckedChange={() => toggle(v.id)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{v.name}</span>
              <span className="text-muted-foreground block truncate font-mono text-xs">
                {v.key}
              </span>
            </span>
          </Label>
        ))}
      </div>
    </FormDialog>
  );
}
