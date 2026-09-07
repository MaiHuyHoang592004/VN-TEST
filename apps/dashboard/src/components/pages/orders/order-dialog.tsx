"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

import {
  EMPTY,
  OrderFormFields,
  isSubmittable,
  valuesFromOrder,
} from "./order-form-fields";
import type { OrderRow } from "./orders-table";

type Option = { id: number; name: string; key?: string; sku?: string | null };

/**
 * Add or edit an order, in a dialog over whatever list you were reading.
 *
 * The FIELDS live in order-form-fields.tsx, shared with /orders/[id]: this
 * component owns the state, the action and the two things only a dialog does —
 * the SKU cascade (create-only) and the idempotency key.
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
  const [values, setValues] = useState(order ? valuesFromOrder(order) : EMPTY);
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
      "too-late": t("orders.errTooLate"),
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
      // A button says exactly what happens. "Save Changes" is the right words
      // when editing and the wrong ones when the press CREATES the order.
      submitLabel={order ? undefined : t("orders.dialogNewSubmit")}
      description={t("orders.dialogDesc")}
      pending={pending}
      submitDisabled={!isSubmittable(values) || (!order && skuId === null)}
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
      <OrderFormFields
        values={values}
        set={set}
        fieldErrors={fieldErrors}
        quantityLocked={Boolean(order) && order?.status !== "PENDING"}
        skuPicker={!order ? <SkuPicker
          products={products}
          productId={productId}
          onProductChange={(id) => {
            setProductId(id);
            // Clear the SKU here: keeping one from the previous variant is how
            // a mismatched pair would reach the server.
            setSkuId(null);
          }}
          skus={skus}
          skuId={skuId}
          onSkuChange={setSkuId}
          error={fieldErrors.productVariantId}
        /> : undefined}
      />
    </FormDialog>
  );
}

/**
 * Product, then that product's priced SKUs. Create-only, because an order's
 * variant is fixed the moment it is priced — changing it later would be a
 * different order at a different price wearing the same id.
 */
function SkuPicker({
  products,
  productId,
  onProductChange,
  skus,
  skuId,
  onSkuChange,
  error,
}: {
  products: Option[];
  productId: number | null;
  onProductChange: (id: number) => void;
  skus: Option[];
  skuId: number | null;
  onSkuChange: (id: number) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <FormField label={t("orders.fProduct")} required className="sm:col-span-1">
        {(props) => (
          <Select
            value={productId === null ? "" : String(productId)}
            onValueChange={(v) => onProductChange(Number(v))}
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
        error={error}
      >
        {(props) => (
          <Select
            value={skuId === null ? "" : String(skuId)}
            onValueChange={(v) => onSkuChange(Number(v))}
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
  );
}
