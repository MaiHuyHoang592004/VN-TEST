"use client";

import { useEffect, useState } from "react";
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
import { listProductOptionsAction } from "@/modules/catalog/products/actions";
import { listSkuOptionsAction } from "@/modules/catalog/product-variants/actions";
import { createOrderAction, updateOrderAction } from "@/modules/fulfillment/orders/actions";

import type { OrderRow } from "./orders-table";

type Option = { id: number; name: string; key?: string; sku?: string | null };

const EMPTY = {
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

/**
 * Add or edit an order.
 *
 * The SKU picker CASCADES: pick a variant, then one of its SKUs. Only the SKU
 * id is submitted — the server reads variant and product off it, so a forged
 * pair can never price an order wrongly. That is also why there is no variant
 * field in the payload at all.
 */
export function OrderDialog({
  order,
  open,
  onOpenChange,
}: {
  /** Omit to create. */
  order?: OrderRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [values, setValues] = useState({
    ...EMPTY,
    ...(order
      ? {
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
        }
      : {}),
  });
  const [products, setProducts] = useState<Option[]>([]);
  const [productId, setProductId] = useState<number | null>(null);
  /**
   * SKUs are cached WITH the variant they belong to, and the visible list is
   * derived from that pair rather than cleared by an effect. Clearing it in an
   * effect is a synchronous setState during render-sync — a cascading render
   * React's lint refuses, and it would also briefly show the previous
   * variant's SKUs. Deriving means a stale list is never displayed at all.
   */
  const [skuCache, setSkuCache] = useState<{ forProduct: number; items: Option[] } | null>(null);
  const skus = skuCache && skuCache.forProduct === productId ? skuCache.items : [];
  const [skuId, setSkuId] = useState<number | null>(order?.productVariantId ?? null);
  // Generated ONCE per dialog open, not per submit — so a double-click or a
  // retry after a dropped response creates the order exactly once, same
  // pattern as RefundDialog/AssignDialog. Unused on edit; updateOrderAction
  // takes no idempotency key because a PATCH-shaped write already lands on
  // the same state when replayed.
  const [idempotencyKey] = useState(() => `order-${Date.now()}-${crypto.randomUUID()}`);

  const set = (k: keyof typeof EMPTY, v: string) => setValues((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (open) listProductOptionsAction().then(setProducts);
  }, [open]);

  // Fetch only. setState happens in the async callback, which is what effects
  // are actually for; the SKU CHOICE is cleared in the picker's handler.
  useEffect(() => {
    if (productId === null) return;
    let cancelled = false;
    listSkuOptionsAction(productId).then((items) => {
      if (!cancelled) setSkuCache({ forProduct: productId, items });
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const { submit, pending, formError, fieldErrors } = useFormAction({
    action: (input: Record<string, unknown>) =>
      order
        ? updateOrderAction(order.id, input, order.updatedAt)
        : createOrderAction(input, undefined, idempotencyKey),
    successMessage: t(order ? "orders.updated" : "orders.created"),
    errorMessages: {
      "unknown-sku": t("orders.errUnknownSku"),
      "sku-inactive": t("orders.errSkuInactive"),
      "cannot-create-for-others": t("orders.errNotYours"),
      "quantity-locked": t("orders.errQuantityLocked"),
      "not-editable": t("orders.errNotEditable"),
      conflict: t("orders.errConflict"),
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
      title={t(order ? "orders.dialogEditTitle" : "orders.dialogNewTitle")}
      description={t("orders.dialogDesc")}
      pending={pending}
      submitDisabled={!values.externalId.trim() || !values.shippingName.trim() || !values.zip.trim() || (!order && skuId === null)}
      formError={formError}
      onSubmit={() =>
        submit({
          ...values,
          // Send exactly what was typed — 0, blank, or garbage included.
          // `|| 1` used to paper over those by silently sending 1, so the
          // server's "quantity must be at least 1" validation could never
          // actually fire from this form.
          quantity: Number(values.quantity),
          productVariantId: skuId ?? undefined,
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("orders.fExternalId")} required error={fieldErrors.externalId}>
          {(props) => (
            <Input
              {...props}
              value={values.externalId}
              onChange={(e) => set("externalId", e.target.value)}
              placeholder="ETSY-1001"
              className="font-mono"
            />
          )}
        </FormField>
        <FormField label={t("orders.fMarketplace")} error={fieldErrors.marketplace}>
          {(props) => (
            <Input
              {...props}
              value={values.marketplace}
              onChange={(e) => set("marketplace", e.target.value)}
              placeholder="Etsy"
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {!order && (
          <>
            <FormField label={t("orders.fProduct")} required className="sm:col-span-1">
              {(props) => (
                <Select
                  value={productId === null ? "" : String(productId)}
                  onValueChange={(v) => {
                    setProductId(Number(v));
                    // Clear the SKU here: keeping one from the previous variant
                    // is how a mismatched pair would reach the server.
                    setSkuId(null);
                  }}
                >
                  <SelectTrigger {...props}>
                    <SelectValue>
                      {products.find((p) => p.id === productId)?.name ?? t("orders.pickProduct")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField
              label={t("orders.fSku")}
              required
              hint={productId !== null && skus.length === 0 ? t("orders.noPricedSkus") : undefined}
              error={fieldErrors.productVariantId}
            >
              {(props) => (
                <Select
                  value={skuId === null ? "" : String(skuId)}
                  onValueChange={(v) => setSkuId(Number(v))}
                  disabled={productId === null || skus.length === 0}
                >
                  <SelectTrigger {...props}>
                    <SelectValue>
                      {skus.find((s) => s.id === skuId)?.name ?? t("orders.pickSku")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {skus.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                        {s.sku ? ` · ${s.sku}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </>
        )}

        {/* Quantity is priced and reserved at assign-time — the server
            refuses this once the order has left PENDING (quantity-locked),
            so the field is disabled here rather than letting someone fill it
            in and only find out on submit. */}
        <FormField
          label={t("orders.fQuantity")}
          required
          hint={order && order.status !== "PENDING" ? t("orders.fQuantityLockedHint") : undefined}
          error={fieldErrors.quantity}
          className={order ? "sm:col-span-1" : undefined}
        >
          {(props) => (
            <Input
              {...props}
              value={values.quantity}
              onChange={(e) => set("quantity", e.target.value)}
              inputMode="numeric"
              className="text-right tabular-nums"
              disabled={Boolean(order) && order?.status !== "PENDING"}
            />
          )}
        </FormField>
      </div>

      <div className="border-border mt-2 border-t pt-4">
        <p className="mb-3 text-sm font-medium">{t("orders.shippingSection")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("orders.fRecipient")} required error={fieldErrors.shippingName}>
            {(props) => (
              <Input
                {...props}
                value={values.shippingName}
                onChange={(e) => set("shippingName", e.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("orders.fEmail")} error={fieldErrors.shippingEmail}>
            {(props) => (
              <Input
                {...props}
                value={values.shippingEmail}
                onChange={(e) => set("shippingEmail", e.target.value)}
                inputMode="email"
              />
            )}
          </FormField>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label={t("orders.fLine1")} error={fieldErrors.line1}>
            {(props) => (
              <Input {...props} value={values.line1} onChange={(e) => set("line1", e.target.value)} />
            )}
          </FormField>
          <FormField label={t("orders.fLine2")} error={fieldErrors.line2}>
            {(props) => (
              <Input {...props} value={values.line2} onChange={(e) => set("line2", e.target.value)} />
            )}
          </FormField>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <FormField label={t("orders.fCity")} error={fieldErrors.city}>
            {(props) => (
              <Input {...props} value={values.city} onChange={(e) => set("city", e.target.value)} />
            )}
          </FormField>
          <FormField label={t("orders.fState")} error={fieldErrors.state}>
            {(props) => (
              <Input {...props} value={values.state} onChange={(e) => set("state", e.target.value)} />
            )}
          </FormField>
          <FormField label={t("orders.fZip")} required error={fieldErrors.zip}>
            {(props) => (
              <Input {...props} value={values.zip} onChange={(e) => set("zip", e.target.value)} />
            )}
          </FormField>
          <FormField label={t("orders.fCountry")} error={fieldErrors.country}>
            {(props) => (
              <Input
                {...props}
                value={values.country}
                onChange={(e) => set("country", e.target.value)}
              />
            )}
          </FormField>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("orders.fNote")} hint={t("orders.fNoteHint")} error={fieldErrors.note}>
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={values.note}
              onChange={(e) => set("note", e.target.value)}
            />
          )}
        </FormField>
        {/* Internal note is customer-to-customer and never shown to the
            warehouse, which is why it is a separate field rather than a
            convention inside `note`. */}
        <FormField
          label={t("orders.fInternalNote")}
          hint={t("orders.fInternalNoteHint")}
          error={fieldErrors.internalNote}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={values.internalNote}
              onChange={(e) => set("internalNote", e.target.value)}
            />
          )}
        </FormField>
      </div>
    </FormDialog>
  );
}
