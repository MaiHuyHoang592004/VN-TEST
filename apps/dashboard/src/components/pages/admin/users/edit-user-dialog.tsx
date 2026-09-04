"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialog, FormField, useFormAction } from "@/components/global/form";
import { updateUserAction } from "@/modules/identity/users/actions";
import { usePermissions } from "@/hooks/use-permissions";
import { USER_ROLES } from "@gwprint/shared";
import { useTranslation } from "@/lib/i18n";

import type { UserRow } from "./users-table";

export function EditUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { can } = usePermissions();
  // Roles are gated by their own permission, server-side too — a support user
  // may edit a profile without being able to hand out ADMIN.
  const mayManageRoles = can("users.roles.manage");

  const [name, setName] = useState(user.name ?? "");
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [status, setStatus] = useState(user.status);
  const [tier, setTier] = useState(user.tier ? String(user.tier) : "");
  const [adminNote, setAdminNote] = useState("");

  const { submit, pending, formError, fieldErrors } = useFormAction({
    action: (input: Record<string, unknown>) => updateUserAction(user.id, input),
    successMessage: t("admin.users.editSaved"),
    errorMessages: {
      "cannot-manage-roles": t("admin.users.errCannotManageRoles"),
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
      title={t("admin.users.editTitle")}
      description={user.email}
      pending={pending}
      submitDisabled={roles.length === 0}
      formError={formError}
      footerHint={
        status !== user.status && status !== "ACTIVE"
          ? t("admin.users.editSignsOut")
          : undefined
      }
      onSubmit={() =>
        submit({
          name,
          phone: "",
          roles,
          status,
          tier: tier ? Number(tier) : null,
          adminNote,
        })
      }
    >
      <FormField label={t("admin.users.editName")} error={fieldErrors.name}>
        {(props) => (
          <Input {...props} value={name} onChange={(e) => setName(e.target.value)} />
        )}
      </FormField>

      <fieldset className="flex flex-col gap-1.5" disabled={!mayManageRoles}>
        <legend className="text-sm font-medium">{t("admin.users.inviteRoles")}</legend>
        {!mayManageRoles && (
          <p className="text-muted-foreground text-xs">
            {t("admin.users.editRolesLocked")}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {USER_ROLES.map((role) => (
            <Label
              key={role}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal has-disabled:opacity-50"
            >
              <Checkbox
                checked={roles.includes(role)}
                disabled={!mayManageRoles}
                onCheckedChange={() =>
                  setRoles((prev) =>
                    prev.includes(role)
                      ? prev.filter((r) => r !== role)
                      : [...prev, role],
                  )
                }
              />
              {t(`admin.roles.${role}`)}
            </Label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("admin.users.editStatus")}>
          {(props) => (
            <Select value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger {...props}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">{t("admin.statuses.ACTIVE")}</SelectItem>
                <SelectItem value="INACTIVE">{t("admin.statuses.INACTIVE")}</SelectItem>
                <SelectItem value="BANNED">{t("admin.statuses.BANNED")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField label={t("admin.users.inviteTier")} error={fieldErrors.tier}>
          {(props) => (
            <Input
              {...props}
              inputMode="numeric"
              value={tier}
              onChange={(e) => setTier(e.target.value.replace(/\D/g, "").slice(0, 1))}
              placeholder="1–4"
            />
          )}
        </FormField>
      </div>

      <FormField label={t("admin.users.editNote")} hint={t("admin.users.editNoteHint")}>
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
          />
        )}
      </FormField>
    </FormDialog>
  );
}
