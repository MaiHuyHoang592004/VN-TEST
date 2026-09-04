"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  requestRefundAction,
  requestTopUpAction,
} from "@/modules/finance/requests/actions";
import { PAYMENT_METHODS } from "@/modules/finance/requests/schema";
import { money } from "@/lib/money";

export type RefundableOrder = { id: number; label: string; total: string };

/** The upload control both dialogs use. Evidence is what turns "I paid you"
 * into something an approver can act on without a conversation. */
function EvidenceField({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);

  return (
    <FormField
      label={t("profile.billing.fEvidence")}
      hint={t("profile.billing.fEvidenceHint")}
    >
      {() => (
        <div className="flex flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              onChange([...files, ...Array.from(e.target.files ?? [])].slice(0, 10));
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => input.current?.click()}
          >
            {t("profile.billing.fEvidence")}
          </Button>
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="border-border text-muted-foreground flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                >
                  {file.name}
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => onChange(files.filter((_, i) => i !== index))}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </FormField>
  );
}

/**
 * "I have sent you money." Creates a PENDING column and tells the approvers —
 * nothing here can credit a balance, which is why a seller is allowed to file
 * it themselves.
 */
export function TopUpRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("bank-transfer");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const { submit, pending, fieldErrors, formError } = useFormAction({
    action: (formData: FormData) => requestTopUpAction(formData),
    successMessage: t("profile.billing.topUpSent"),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
    errorMessages: {
      "file-too-large": t("profile.billing.errors.file-too-large"),
      "not-an-image": t("profile.billing.errors.not-an-image"),
      "too-many-files": t("profile.billing.errors.too-many-files"),
      "storage-not-configured": t("profile.billing.errors.storage-not-configured"),
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("profile.billing.topUpTitle")}
      description={t("profile.billing.topUpDesc")}
      submitLabel={t("profile.billing.topUpSubmit")}
      pending={pending}
      submitDisabled={!amount.trim()}
      formError={formError}
      onSubmit={() => {
        const formData = new FormData();
        formData.set("amount", amount);
        formData.set("method", method);
        formData.set("note", note);
        for (const file of files) formData.append("files", file);
        submit(formData);
      }}
    >
      <FormField label={t("profile.billing.fAmount")} required error={fieldErrors.amount}>
        {(props) => (
          <Input
            {...props}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100.00"
          />
        )}
      </FormField>

      <FormField label={t("profile.billing.fMethod")} error={fieldErrors.method}>
        {() => (
          <Select value={method} onValueChange={(v) => setMethod(v || "bank-transfer")}>
            <SelectTrigger>
              <SelectValue>{t(`profile.billing.methods.${method}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`profile.billing.methods.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField label={t("profile.billing.fNote")} error={fieldErrors.note}>
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("profile.billing.fNotePlaceholder")}
          />
        )}
      </FormField>

      <EvidenceField files={files} onChange={setFiles} />
    </FormDialog>
  );
}

/**
 * "These orders went wrong." The running total is the SERVER's quote, not a
 * number this component invents — leaving the amount blank asks for exactly it,
 * and the service refuses anything above it.
 */
export function RefundRequestDialog({
  orders,
  open,
  onOpenChange,
}: {
  orders: RefundableOrder[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const total = orders
    .filter((o) => picked.has(o.id))
    .reduce((sum, o) => sum + Number(o.total), 0)
    .toFixed(2);

  const { submit, pending, fieldErrors, formError } = useFormAction({
    action: (formData: FormData) => requestRefundAction(formData),
    successMessage: t("profile.billing.refundSent"),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
    errorMessages: {
      "nothing-refundable": t("profile.billing.errors.nothing-refundable"),
      "duplicate-request": t("profile.billing.errors.duplicate-request"),
      "over-cap": t("profile.billing.errors.over-cap"),
      "file-too-large": t("profile.billing.errors.file-too-large"),
      "not-an-image": t("profile.billing.errors.not-an-image"),
      "too-many-files": t("profile.billing.errors.too-many-files"),
      "storage-not-configured": t("profile.billing.errors.storage-not-configured"),
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("profile.billing.refundTitle")}
      description={t("profile.billing.refundDesc")}
      submitLabel={t("profile.billing.refundSubmit")}
      pending={pending}
      submitDisabled={picked.size === 0 || reason.trim().length < 3}
      formError={formError}
      footerHint={picked.size > 0 ? `${t("profile.billing.quoteTotal")}: ${money(total)}` : undefined}
      onSubmit={() => {
        const formData = new FormData();
        formData.set("orderIds", [...picked].join(","));
        formData.set("reason", reason);
        formData.set("amount", amount);
        for (const file of files) formData.append("files", file);
        submit(formData);
      }}
    >
      <FormField
        label={t("profile.billing.fOrders")}
        hint={t("profile.billing.fOrdersHint")}
        error={fieldErrors.orderIds}
      >
        {() =>
          orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("profile.billing.noOrders")}</p>
          ) : (
            <div className="border-border divide-border max-h-56 divide-y overflow-y-auto rounded-md border">
              {orders.map((order) => (
                <label
                  key={order.id}
                  className="hover:bg-muted/40 flex cursor-pointer items-center justify-between gap-3 p-2.5 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Checkbox
                      checked={picked.has(order.id)}
                      onCheckedChange={(on) =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (on) next.add(order.id);
                          else next.delete(order.id);
                          return next;
                        })
                      }
                    />
                    <span className="truncate font-mono text-xs">{order.label}</span>
                  </span>
                  <span className="tabular-nums">{money(order.total)}</span>
                </label>
              ))}
            </div>
          )
        }
      </FormField>

      <FormField label={t("profile.billing.fReason")} required error={fieldErrors.reason}>
        {(props) => (
          <Textarea
            {...props}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("profile.billing.fReasonPlaceholder")}
          />
        )}
      </FormField>

      <FormField
        label={t("profile.billing.fAmount")}
        hint={t("profile.billing.fAmountHint")}
        error={fieldErrors.amount}
      >
        {(props) => (
          <Input
            {...props}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={total}
          />
        )}
      </FormField>

      <EvidenceField files={files} onChange={setFiles} />
    </FormDialog>
  );
}
