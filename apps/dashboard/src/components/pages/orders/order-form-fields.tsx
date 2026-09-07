"use client";

import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, fieldRules } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { orderSchema } from "@/modules/fulfillment/orders/schema.ts";

/**
 * The order's editable fields, once, for both surfaces that edit an order.
 *
 * They were the body of OrderDialog until /orders/[id] needed the same set. A
 * second copy would have been the kind that drifts quietly: orderSchema
 * already accepts `shippingPhone` and the spreadsheet importer already fills
 * it, and this form went a whole release without a phone input because the
 * state had it and the JSX did not. One copy is how that stops recurring.
 *
 * Presentation only. It owns no state, fires no action and knows nothing about
 * dialogs or pages — the caller holds `values`, decides what a save means, and
 * passes the product/SKU picker in as a node because that pair exists only
 * when CREATING an order.
 */

/** Read once from the schema the server validates with, so the hints under
 * these fields cannot drift from the rules that actually reject a value. */
export const RULES = fieldRules(orderSchema);

export const EMPTY = {
  externalId: "",
  marketplace: "",
  quantity: "1",
  shippingName: "",
  shippingCompany: "",
  shippingEmail: "",
  shippingPhone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  zip: "",
  country: "",
  note: "",
  internalNote: "",
};

export type OrderFormValues = typeof EMPTY;

/** Every nullable column becomes "" — an input's value may not be null, and a
 *  blank is what blankToNull turns back into null on the way out. */
export function valuesFromOrder(order: {
  externalId: string | null;
  marketplace: string | null;
  quantity: number;
  shippingName: string | null;
  shippingCompany: string | null;
  shippingEmail: string | null;
  shippingPhone: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  note: string | null;
  internalNote: string | null;
}): OrderFormValues {
  return {
    externalId: order.externalId ?? "",
    marketplace: order.marketplace ?? "",
    quantity: String(order.quantity),
    shippingName: order.shippingName ?? "",
    shippingCompany: order.shippingCompany ?? "",
    shippingEmail: order.shippingEmail ?? "",
    shippingPhone: order.shippingPhone ?? "",
    line1: order.line1 ?? "",
    line2: order.line2 ?? "",
    city: order.city ?? "",
    state: order.state ?? "",
    zip: order.zip ?? "",
    country: order.country ?? "",
    note: order.note ?? "",
    internalNote: order.internalNote ?? "",
  };
}

/** The minimum the server will accept — checked here only to keep the submit
 *  button honest, never as the validation itself. */
export const isSubmittable = (values: OrderFormValues) =>
  Boolean(values.externalId.trim() && values.shippingName.trim() && values.zip.trim());

export type FieldErrors = Partial<Record<keyof OrderFormValues | "productVariantId", string>>;

export function OrderFormFields({
  values,
  set,
  fieldErrors,
  skuPicker,
  quantityLocked = false,
  disabled = false,
}: {
  values: OrderFormValues;
  set: (key: keyof OrderFormValues, value: string) => void;
  fieldErrors: FieldErrors;
  /** The product + SKU pair, supplied only when creating. */
  skuPicker?: ReactNode;
  /** Priced and reserved at assign-time: the server refuses a change once the
   *  order has left PENDING, so the input says so rather than letting someone
   *  type a number and find out on submit. */
  quantityLocked?: boolean;
  /** The whole order is past its edit window. Every field goes read-only
   *  together — a form where some inputs work and some do not, with no
   *  explanation, reads as broken rather than as closed. */
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const off = disabled;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("orders.fExternalId")}
          required
          hint={t("orders.fExternalIdHint")}
          rules={RULES.externalId}
          error={fieldErrors.externalId}
        >
          {(props) => (
            <Input
              {...props}
              value={values.externalId}
              onChange={(e) => set("externalId", e.target.value)}
              placeholder="ETSY-1001"
              className="font-mono"
              disabled={off}
            />
          )}
        </FormField>
        <FormField
          label={t("orders.fMarketplace")}
          rules={RULES.marketplace}
          error={fieldErrors.marketplace}
        >
          {(props) => (
            <Input
              {...props}
              value={values.marketplace}
              onChange={(e) => set("marketplace", e.target.value)}
              placeholder="Etsy"
              disabled={off}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {skuPicker}
        <FormField
          label={t("orders.fQuantity")}
          required
          hint={quantityLocked ? t("orders.fQuantityLockedHint") : undefined}
          rules={RULES.quantity}
          error={fieldErrors.quantity}
          className={skuPicker ? undefined : "sm:col-span-1"}
        >
          {(props) => (
            <Input
              {...props}
              value={values.quantity}
              onChange={(e) => set("quantity", e.target.value)}
              inputMode="numeric"
              className="text-right tabular-nums"
              disabled={off || quantityLocked}
            />
          )}
        </FormField>
      </div>

      <div className="mt-2 border-t border-(--border-soft) pt-4">
        <p className="mb-3 text-(length:--fs-body-sm) font-medium text-(--text-body)">
          {t("orders.shippingSection")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t("orders.fRecipient")}
            required
            hint={t("orders.fRecipientHint")}
            rules={RULES.shippingName}
            error={fieldErrors.shippingName}
          >
            {(props) => (
              <Input
                {...props}
                value={values.shippingName}
                onChange={(e) => set("shippingName", e.target.value)}
                disabled={off}
              />
            )}
          </FormField>
          <FormField
            label={t("orders.fEmail")}
            rules={RULES.shippingEmail}
            error={fieldErrors.shippingEmail}
          >
            {(props) => (
              <Input
                {...props}
                value={values.shippingEmail}
                onChange={(e) => set("shippingEmail", e.target.value)}
                inputMode="email"
                disabled={off}
              />
            )}
          </FormField>
        </div>
        {/* Phone and company were in this form's state and in its submit long
            before they had anywhere to be typed: orderSchema accepts both, and
            the spreadsheet importer maps a "Phone" column onto shippingPhone —
            so an imported order could hold a phone number that nobody could
            read or correct here. The fields are the fix, not deleting the
            state. */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField
            label={t("orders.fPhone")}
            hint={t("orders.fPhoneHint")}
            rules={RULES.shippingPhone}
            error={fieldErrors.shippingPhone}
          >
            {(props) => (
              <Input
                {...props}
                value={values.shippingPhone}
                onChange={(e) => set("shippingPhone", e.target.value)}
                inputMode="tel"
                disabled={off}
              />
            )}
          </FormField>
          <FormField
            label={t("orders.fCompany")}
            rules={RULES.shippingCompany}
            error={fieldErrors.shippingCompany}
          >
            {(props) => (
              <Input
                {...props}
                value={values.shippingCompany}
                onChange={(e) => set("shippingCompany", e.target.value)}
                disabled={off}
              />
            )}
          </FormField>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label={t("orders.fLine1")} rules={RULES.line1} error={fieldErrors.line1}>
            {(props) => (
              <Input
                {...props}
                value={values.line1}
                onChange={(e) => set("line1", e.target.value)}
                disabled={off}
              />
            )}
          </FormField>
          <FormField label={t("orders.fLine2")} rules={RULES.line2} error={fieldErrors.line2}>
            {(props) => (
              <Input
                {...props}
                value={values.line2}
                onChange={(e) => set("line2", e.target.value)}
                disabled={off}
              />
            )}
          </FormField>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <FormField label={t("orders.fCity")} rules={RULES.city} error={fieldErrors.city}>
            {(props) => (
              <Input
                {...props}
                value={values.city}
                onChange={(e) => set("city", e.target.value)}
                disabled={off}
              />
            )}
          </FormField>
          <FormField label={t("orders.fState")} rules={RULES.state} error={fieldErrors.state}>
            {(props) => (
              <Input
                {...props}
                value={values.state}
                onChange={(e) => set("state", e.target.value)}
                disabled={off}
              />
            )}
          </FormField>
          <FormField label={t("orders.fZip")} required rules={RULES.zip} error={fieldErrors.zip}>
            {(props) => (
              <Input
                {...props}
                value={values.zip}
                onChange={(e) => set("zip", e.target.value)}
                disabled={off}
              />
            )}
          </FormField>
          <FormField label={t("orders.fCountry")} rules={RULES.country} error={fieldErrors.country}>
            {(props) => (
              <Input
                {...props}
                value={values.country}
                onChange={(e) => set("country", e.target.value)}
                disabled={off}
              />
            )}
          </FormField>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("orders.fNote")}
          hint={t("orders.fNoteHint")}
          rules={RULES.note}
          error={fieldErrors.note}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={values.note}
              onChange={(e) => set("note", e.target.value)}
              disabled={off}
            />
          )}
        </FormField>
        {/* Internal note is customer-to-customer and never shown to the
            warehouse, which is why it is a separate field rather than a
            convention inside `note`. */}
        <FormField
          label={t("orders.fInternalNote")}
          hint={t("orders.fInternalNoteHint")}
          rules={RULES.internalNote}
          error={fieldErrors.internalNote}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={values.internalNote}
              onChange={(e) => set("internalNote", e.target.value)}
              disabled={off}
            />
          )}
        </FormField>
      </div>
    </>
  );
}
