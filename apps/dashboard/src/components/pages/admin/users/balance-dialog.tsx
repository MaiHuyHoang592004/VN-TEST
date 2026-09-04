"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialog, FormField, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  topUpBalanceAction,
  refundBalanceAction,
  adjustBalanceAction,
} from "@/modules/identity/users/actions";

import type { UserRow } from "./users-table";
import { money } from "@/lib/money";

export type BalanceMode = "TOPUP" | "REFUND" | "ADJUST";

/** Key stems only; wording lives in the locale files. */
const STEM: Record<BalanceMode, string> = {
  TOPUP: "balTopUp",
  REFUND: "balRefund",
  ADJUST: "balAdjust",
};

export function BalanceDialog({
  user,
  mode,
  open,
  onOpenChange,
}: {
  user: UserRow;
  mode: BalanceMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const stem = STEM[mode];
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("bank");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");

  // Generated per dialog opening, not per submit: a double-click sends the same
  // key twice and the UNIQUE constraint makes the second a no-op instead of a
  // second charge.
  const idempotencyKey = useMemo(
    () => `admin-${mode}-${user.id}-${globalThis.crypto.randomUUID()}`,
    [mode, user.id],
  );

  const { submit, pending, formError } = useFormAction({
    action: (input: { amount: string; reason: string; paymentMethod?: string; idempotencyKey: string }) =>
      mode === "TOPUP"
        ? topUpBalanceAction(user.id, input)
        : mode === "REFUND"
          ? refundBalanceAction(user.id, input)
          : adjustBalanceAction(user.id, direction, input),
    successMessage: t("admin.users.balUpdated"),
    errorMessages: {
      "insufficient-balance": t("admin.users.errInsufficient"),
    },
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });

  const current = Number(user.balance);
  const parsed = Number(amount);
  const valid = /^\d+(\.\d{1,2})?$/.test(amount) && parsed > 0 && reason.trim().length >= 3;
  const signed = mode === "ADJUST" && direction === "debit" ? -parsed : parsed;
  const projected = valid ? current + signed : current;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(`admin.users.${stem}Title`)}
      description={`${t(`admin.users.${stem}Desc`)} — ${user.name || user.email}`}
      submitLabel={t(`admin.users.${stem}Submit`)}
      pending={pending}
      submitDisabled={!valid}
      formError={formError}
      // The confirmation an admin actually needs: what the balance becomes.
      footerHint={valid ? `${money(current)} → ${money(projected)}` : undefined}
      onSubmit={() =>
        submit({
          amount,
          reason: reason.trim(),
          paymentMethod: mode === "TOPUP" ? method : undefined,
          idempotencyKey,
        })
      }
    >
      {mode === "ADJUST" && (
        <FormField label={t("admin.users.balDirection")} required>
          {(props) => (
            <Select
              value={direction}
              onValueChange={(v) => v && setDirection(v as "credit" | "debit")}
            >
              <SelectTrigger {...props}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">{t("admin.users.balCredit")}</SelectItem>
                <SelectItem value="debit">{t("admin.users.balDebit")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}

      <FormField label={t("admin.users.balAmount")} required hint={t("admin.users.balAmountHint")}>
        {(props) => (
          <Input
            {...props}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        )}
      </FormField>

      {mode === "TOPUP" && (
        <FormField label={t("admin.users.balMethod")}>
          {(props) => (
            <Select value={method} onValueChange={(v) => v && setMethod(v)}>
              <SelectTrigger {...props}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">{t("admin.users.methodBank")}</SelectItem>
                <SelectItem value="cash">{t("admin.users.methodCash")}</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="other">{t("admin.users.methodOther")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}

      <FormField
        label={t("admin.users.balReason")}
        required
        hint={t("admin.users.balReasonHint")}
      >
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("admin.users.balReasonPlaceholder")}
          />
        )}
      </FormField>
    </FormDialog>
  );
}
