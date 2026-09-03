"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { FormDialog, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  deleteMaterialAction,
  getMaterialUsageAction,
} from "@/modules/inventory/materials/actions";

import type { MaterialRow } from "./material-dialog";

type Usage = { activeBomLines: number; bomLines: number; stockRows: number; canDelete: boolean };

/**
 * Delete a material, or explain what is stopping it.
 *
 * Only ACTIVE BOM lines block: a draft recipe is someone's work in progress
 * and an inactive one is history, neither of which should stop the floor
 * retiring an item it no longer buys. The dialog asks the server first so the
 * refusal is explained rather than just enforced.
 */
export function DeleteMaterialDialog({
  material,
  open,
  onOpenChange,
}: {
  material: MaterialRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMaterialUsageAction(material.id).then((u) => {
      if (!cancelled) setUsage(u as Usage);
    });
    return () => {
      cancelled = true;
    };
  }, [open, material.id]);

  const canDelete = usage?.canDelete ?? false;

  const { submit, pending, formError } = useFormAction({
    action: () => deleteMaterialAction(material.id),
    successMessage: t("inventory.materials.deleted"),
    errorMessages: { "in-use": t("inventory.materials.delete.blocked") },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("inventory.materials.delete.title")}
      description={`${material.sku} — ${material.name}`}
      submitLabel={t("inventory.materials.delete.submit")}
      destructive
      pending={pending || !usage}
      submitDisabled={Boolean(usage) && !canDelete}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          {!usage
            ? "…"
            : canDelete
              ? t("inventory.materials.delete.confirm")
              : t("inventory.materials.delete.blocked")}
        </p>
        {usage && !canDelete && (
          <Badge variant="secondary" className="self-start">
            {usage.activeBomLines} {t("inventory.materials.delete.pillBomLines")}
          </Badge>
        )}
      </div>
    </FormDialog>
  );
}
