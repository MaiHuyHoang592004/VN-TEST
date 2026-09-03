"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormDialog, FormField, useFormAction } from "@/components/global/form";
import { inviteUserAction } from "@/modules/identity/users/actions";
import { USER_ROLES } from "@opcreative/shared";
import { useTranslation } from "@/lib/i18n";

/**
 * Invite by email. Deliberately has NO password field: with Google sign-in the
 * invitee sets up their own credentials, and an admin typing someone else's
 * password is both insecure and usually pointless.
 */
export function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>(["SELLER"]);
  const [tier, setTier] = useState("");

  const { submit, pending, formError, fieldErrors } = useFormAction({
    action: (input: { email: string; roles: string[]; tier?: number | null }) =>
      inviteUserAction(input),
    successMessage: t("admin.users.inviteSent"),
    errorMessages: {
      "already-has-roles":
        t("admin.users.errAlreadyHasRoles"),
      "cannot-grant-roles": t("admin.users.errCannotGrantRoles"),
    },
    onSuccess: () => {
      setEmail("");
      setRoles(["SELLER"]);
      setTier("");
      onOpenChange(false);
      router.refresh();
    },
  });

  const toggleRole = (role: string) =>
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("admin.users.inviteTitle")}
      description={t("admin.users.inviteDesc")}
      submitLabel={t("admin.users.inviteSend")}
      pending={pending}
      submitDisabled={!email.trim() || roles.length === 0}
      formError={formError}
      onSubmit={() =>
        submit({
          email: email.trim(),
          roles,
          tier: tier ? Number(tier) : null,
        })
      }
    >
      <FormField label={t("admin.users.inviteEmail")} required error={fieldErrors.email}>
        {(props) => (
          <Input
            {...props}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        )}
      </FormField>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">{t("admin.users.inviteRoles")}</legend>
        {fieldErrors.roles && (
          <p role="alert" className="text-destructive text-xs">
            {fieldErrors.roles}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {USER_ROLES.map((role) => (
            <Label
              key={role}
              className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal"
            >
              <Checkbox
                checked={roles.includes(role)}
                onCheckedChange={() => toggleRole(role)}
              />
              {t(`admin.roles.${role}`)}
            </Label>
          ))}
        </div>
      </fieldset>

      <FormField
        label={t("admin.users.inviteTier")}
        hint={t("admin.users.inviteTierHint")}
        error={fieldErrors.tier}
      >
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
    </FormDialog>
  );
}
