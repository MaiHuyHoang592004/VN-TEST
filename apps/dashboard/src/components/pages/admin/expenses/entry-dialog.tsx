"use client";

import { useState } from "react";
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
import { createEntryAction, updateEntryAction } from "@/modules/finance/expenses/actions";

import type { CategoryRow, EntryRow, VendorOption } from "./expenses-panel";

const NO_VENDOR = "NONE";
/** YYYY-MM-DD, which is what <input type="date"> speaks. */
const dateValue = (iso?: string) => (iso ?? new Date().toISOString()).slice(0, 10);

/**
 * One line of the company's books.
 *
 * The TYPE follows the category but stays editable — a supplier refund is
 * income filed under an expense bucket, and forcing it to move category would
 * lose the grouping the report is built on.
 */
export function EntryDialog({
  entry,
  categories,
  vendors,
  open,
  onOpenChange,
}: {
  entry?: EntryRow;
  categories: CategoryRow[];
  vendors: VendorOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [form, setForm] = useState({
    categoryId: entry ? String(entry.category.id) : (categories[0] ? String(categories[0].id) : ""),
    type: entry?.type ?? categories[0]?.type ?? "EXPENSE",
    amount: entry?.amount ?? "",
    occurredAt: dateValue(entry?.occurredAt),
    vendorId: entry?.vendor ? String(entry.vendor.id) : NO_VENDOR,
    paymentMethod: entry?.paymentMethod ?? "",
    description: entry?.description ?? "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const { submit, pending, fieldErrors, formError } = useFormAction({
    action: (input: unknown) =>
      entry ? updateEntryAction(entry.id, input) : createEntryAction(input),
    successMessage: entry ? t("finance.expenses.saved") : t("finance.expenses.created"),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
    errorMessages: { "not-found": t("finance.expenses.errNotFound") },
  });

  const selectedCategory = categories.find((c) => String(c.id) === form.categoryId);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? t("finance.expenses.editTitle") : t("finance.expenses.newTitle")}
      submitLabel={entry ? t("admin.actions.save") : t("finance.expenses.new")}
      pending={pending}
      submitDisabled={!form.categoryId || !form.amount.trim()}
      formError={formError}
      onSubmit={() =>
        submit({
          categoryId: Number(form.categoryId),
          type: form.type,
          amount: form.amount,
          occurredAt: form.occurredAt,
          ...(form.vendorId !== NO_VENDOR ? { vendorId: Number(form.vendorId) } : {}),
          paymentMethod: form.paymentMethod,
          description: form.description,
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("finance.expenses.fCategory")} required error={fieldErrors.categoryId}>
          {() => (
            <Select
              value={form.categoryId}
              onValueChange={(v) => {
                const next = categories.find((c) => String(c.id) === v);
                // The category suggests the direction; the field below can
                // still disagree.
                set({ categoryId: v || "", type: next?.type ?? form.type });
              }}
            >
              <SelectTrigger>
                <SelectValue>
                  {selectedCategory?.name ?? t("finance.expenses.pickCategory")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField
          label={t("finance.expenses.fType")}
          hint={t("finance.expenses.fTypeHint")}
          error={fieldErrors.type}
        >
          {() => (
            <Select value={form.type} onValueChange={(v) => set({ type: v || "EXPENSE" })}>
              <SelectTrigger>
                <SelectValue>{t(`finance.expenses.types.${form.type}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">{t("finance.expenses.types.EXPENSE")}</SelectItem>
                <SelectItem value="INCOME">{t("finance.expenses.types.INCOME")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField label={t("finance.expenses.fAmount")} required error={fieldErrors.amount}>
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
              placeholder="0.00"
            />
          )}
        </FormField>

        <FormField label={t("finance.expenses.fDate")} required error={fieldErrors.occurredAt}>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={form.occurredAt}
              onChange={(e) => set({ occurredAt: e.target.value })}
            />
          )}
        </FormField>

        <FormField label={t("finance.expenses.fVendor")} error={fieldErrors.vendorId}>
          {() => (
            <Select value={form.vendorId} onValueChange={(v) => set({ vendorId: v || NO_VENDOR })}>
              <SelectTrigger>
                <SelectValue>
                  {vendors.find((x) => String(x.id) === form.vendorId)?.name ??
                    t("finance.expenses.noVendor")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VENDOR}>{t("finance.expenses.noVendor")}</SelectItem>
                {vendors.map((x) => (
                  <SelectItem key={x.id} value={String(x.id)}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField label={t("finance.expenses.fPayment")} error={fieldErrors.paymentMethod}>
          {(props) => (
            <Input
              {...props}
              value={form.paymentMethod}
              onChange={(e) => set({ paymentMethod: e.target.value })}
            />
          )}
        </FormField>
      </div>

      <FormField label={t("finance.expenses.fDescription")} error={fieldErrors.description}>
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        )}
      </FormField>
    </FormDialog>
  );
}
