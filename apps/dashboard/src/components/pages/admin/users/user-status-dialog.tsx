"use client";

import { useRouter } from "next/navigation";

import { FormDialog, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  setUserStatusAction,
  deleteUserAction,
} from "@/modules/identity/users/actions";

import type { UserRow } from "./users-table";

export type StatusAction = "ACTIVATE" | "DEACTIVATE" | "DELETE";

/** Only the key stems live here; the wording comes from the locale files.
 * DEACTIVATE and DELETE are destructive: they end sessions immediately, which
 * the body text says plainly rather than hiding behind "are you sure?". */
const KEYS: Record<StatusAction, { stem: string; destructive: boolean }> = {
  ACTIVATE: { stem: "stActivate", destructive: false },
  DEACTIVATE: { stem: "stDeactivate", destructive: true },
  DELETE: { stem: "stDelete", destructive: true },
};

export function UserStatusDialog({
  user,
  action,
  open,
  onOpenChange,
}: {
  user: UserRow;
  action: StatusAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { stem, destructive } = KEYS[action];

  const { submit, pending, formError } = useFormAction({
    action: () =>
      action === "DELETE"
        ? deleteUserAction(user.id)
        : setUserStatusAction(user.id, action === "ACTIVATE" ? "ACTIVE" : "INACTIVE"),
    successMessage: t(
      action === "DELETE"
        ? "admin.users.stDeleted"
        : action === "ACTIVATE"
          ? "admin.users.stActivated"
          : "admin.users.stDeactivated",
    ),
    errorMessages: {
      "cannot-delete-self": t("admin.users.errCannotDeleteSelf"),
    },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(`admin.users.${stem}Title`)}
      description={user.name || user.email}
      submitLabel={t(`admin.users.${stem}Submit`)}
      destructive={destructive}
      pending={pending}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      <p className="text-muted-foreground text-sm">{t(`admin.users.${stem}Body`)}</p>
    </FormDialog>
  );
}
