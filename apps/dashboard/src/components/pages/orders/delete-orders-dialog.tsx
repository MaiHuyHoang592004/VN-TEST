"use client";

import { useRouter } from "next/navigation";

import { FormDialog, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { deleteOrdersAction } from "@/modules/fulfillment/orders/actions";

/** Bulk soft-delete. An order is financial history, so the rows survive — this
 * removes them from the working list, nothing more. */
export function DeleteOrdersDialog({
  orderIds,
  open,
  onOpenChange,
  onDone,
}: {
  orderIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();

  const { submit, pending, formError } = useFormAction({
    action: () => deleteOrdersAction(orderIds),
    successMessage: t("orders.deleted"),
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
      title={t("orders.deleteTitle")}
      description={t("orders.deleteDesc").replace("{count}", String(orderIds.length))}
      submitLabel={t("orders.deleteSubmit")}
      destructive
      pending={pending}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      <p className="text-muted-foreground text-sm">{t("orders.deleteBody")}</p>
    </FormDialog>
  );
}
