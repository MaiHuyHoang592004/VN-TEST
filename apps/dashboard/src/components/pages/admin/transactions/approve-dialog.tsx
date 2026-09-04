"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Textarea } from "@/components/ui/textarea";
import { FormDialog, FormField, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import {
  approveTransactionAction,
  rejectTransactionAction,
} from "@/modules/finance/transactions/actions";

import type { TransactionRow } from "./transactions-table";
import { money } from "@/lib/money";

/**
 * Approve or reject one pending column.
 *
 * Approving shows "balance X → Y" first, because this credits real money and
 * the number should be checked before it moves, not after. Rejecting REQUIRES a
 * reason — the seller is shown it, and a refusal they can't understand becomes
 * a support ticket every time.
 */
export function ApproveDialog({
  transaction,
  mode,
  open,
  onOpenChange,
}: {
  transaction: TransactionRow;
  mode: "approve" | "reject";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const approving = mode === "approve";

  const { submit, pending, formError, fieldErrors } = useFormAction({
    action: () =>
      approving
        ? approveTransactionAction(transaction.id)
        : rejectTransactionAction(transaction.id, { reason }),
    successMessage: t(approving ? "finance.approved" : "finance.rejected"),
    errorMessages: {
      "not-pending": t("finance.errNotPending"),
      "not-approvable": t("finance.errNotApprovable"),
      "insufficient-balance": t("finance.errInsufficient"),
      "not-found": t("finance.errNotFound"),
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
      title={t(approving ? "finance.approveTitle" : "finance.rejectTitle")}
      description={`${transaction.userName} — ${transaction.publicId}`}
      submitLabel={t(approving ? "finance.approveSubmit" : "finance.rejectSubmit")}
      destructive={!approving}
      pending={pending}
      submitDisabled={!approving && reason.trim().length < 3}
      formError={formError}
      onSubmit={() => submit(undefined as never)}
    >
      <div className="border-border flex items-center justify-between gap-3 rounded-md border p-3">
        <span className="text-sm">{t(`finance.types.${transaction.type}`)}</span>
        <span className="font-mono text-sm font-medium tabular-nums">
          {money(transaction.amount)}
        </span>
      </div>

      {approving ? (
        <p className="text-muted-foreground text-sm">{t("finance.approveBody")}</p>
      ) : (
        <FormField
          label={t("finance.fReason")}
          required
          hint={t("finance.fReasonHint")}
          error={fieldErrors.reason}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("finance.fReasonPlaceholder")}
            />
          )}
        </FormField>
      )}
    </FormDialog>
  );
}
