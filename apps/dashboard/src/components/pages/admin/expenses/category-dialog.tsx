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
import { createCategoryAction, updateCategoryAction } from "@/modules/finance/expenses/actions";

import type { CategoryRow } from "./expenses-panel";

/** A bucket for the books. Its type is what a new entry defaults to — nothing
 * more, which is why an entry may still disagree with it. */
export function CategoryDialog({
  category,
  open,
  onOpenChange,
}: {
  category?: CategoryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: category?.name ?? "",
    type: category?.type ?? "EXPENSE",
    note: category?.note ?? "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const { submit, pending, fieldErrors, formError } = useFormAction({
    action: (input: typeof form) =>
      category ? updateCategoryAction(category.id, input) : createCategoryAction(input),
    successMessage: category
      ? t("finance.expenses.categorySaved")
      : t("finance.expenses.categoryCreated"),
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
    errorMessages: { "not-found": t("finance.expenses.errNotFound") },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        category ? t("finance.expenses.editCategory") : t("finance.expenses.newCategoryTitle")
      }
      submitLabel={category ? t("admin.actions.save") : t("finance.expenses.newCategory")}
      pending={pending}
      submitDisabled={!form.name.trim()}
      formError={formError}
      onSubmit={() => submit(form)}
    >
      <FormField label={t("finance.expenses.fName")} required error={fieldErrors.name}>
        {(props) => (
          <Input {...props} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        )}
      </FormField>

      <FormField label={t("finance.expenses.fType")} error={fieldErrors.type}>
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

      <FormField label={t("finance.expenses.fNote")} error={fieldErrors.note}>
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        )}
      </FormField>
    </FormDialog>
  );
}
