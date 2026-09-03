"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { FormDialog, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  deleteMockupAction,
  getMockupUsageAction,
  updateMockupAction,
} from "@/modules/catalog/mockups/actions";

import type { MockupRow } from "./mockup-dialog";

type Usage = { orders: number; canDelete: boolean };

/**
 * Deleting a mockup is a REAL delete, not a soft one — Mockup has no deletedAt
 * row to hide behind. So the refusal matters more here than elsewhere: an
 * order points at the artwork it was produced from, and that reference has to
 * keep resolving forever. When orders exist, this becomes "Deactivate".
 */
export function DeleteMockupDialog({
  mockup,
  open,
  onOpenChange,
}: {
  mockup: MockupRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMockupUsageAction(mockup.id).then((u) => {
      if (!cancelled) setUsage(u as Usage);
    });
    return () => {
      cancelled = true;
    };
  }, [open, mockup.id]);

  const canDelete = usage?.canDelete ?? false;

  const { submit, pending, formError } = useFormAction({
    action: () =>
      canDelete
        ? deleteMockupAction(mockup.id)
        : updateMockupAction(mockup.id, {
            name: mockup.name,
            url: mockup.url,
            thumbnail: mockup.thumbnail ?? "",
            folderId: mockup.folderId ?? "",
            status: "inactive",
          }),
    successMessage: t(canDelete ? "catalog.mockups.delDeleted" : "catalog.mockups.delDeactivated"),
    errorMessages: { "in-use": t("catalog.mockups.delInUse") },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(canDelete ? "catalog.mockups.delTitle" : "catalog.mockups.delDeactivateTitle")}
      description={mockup.name}
      submitLabel={t(canDelete ? "admin.actions.delete" : "admin.users.deactivate")}
      destructive
      pending={pending || !usage}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      {!usage ? (
        <p className="text-muted-foreground text-sm">{t("catalog.mockups.delChecking")}</p>
      ) : canDelete ? (
        <p className="text-muted-foreground text-sm">{t("catalog.mockups.delSafe")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">{t("catalog.mockups.delInUse")}</p>
          <Badge product="secondary">
            {usage.orders} {t("catalog.mockups.pillOrders")}
          </Badge>
        </div>
      )}
    </FormDialog>
  );
}
