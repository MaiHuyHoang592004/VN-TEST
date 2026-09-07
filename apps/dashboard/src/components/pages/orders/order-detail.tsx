"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ds";
import { useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { money } from "@/lib/money";
import { updateOrderAction } from "@/modules/fulfillment/orders/actions";

import { ArtworkLightbox } from "./artwork-lightbox";
import { SHOT_CAPTION, type ArtworkShot } from "./order-thumb";
import { OrderFormFields, isSubmittable, valuesFromOrder } from "./order-form-fields";
import { OrderTimeline } from "./order-timeline";
import type { OrderRow } from "./orders-table";

/**
 * One order, on its own page, with room to correct it.
 *
 * The table's edit dialog is for a quick fix while you keep your place in a
 * list. This is for the other case — somebody on the phone to a customer,
 * reading the address back, looking at the artwork and the timeline while they
 * do it. Same fields (order-form-fields.tsx), same action, more context around
 * them.
 *
 * WHETHER it may be edited is decided on the server and arrives as `policy`.
 * Doing it here would be a second implementation of a rule that already exists
 * in two places, and the one in the browser is the one that cannot be trusted
 * anyway — updateOrder re-decides on every save. This only keeps the page from
 * offering a form whose save is going to be refused.
 */
export function OrderDetail({
  order,
  shots,
  policy,
}: {
  order: OrderRow;
  /** Precomputed by the page so the strip and the panel agree — same helper
   *  the table's thumbnail column uses. */
  shots: ArtworkShot[];
  policy: { editable: boolean; wide: boolean; reason: null | "role" | "too-late" };
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [values, setValues] = useState(() => valuesFromOrder(order));
  const [lightbox, setLightbox] = useState<number | null>(null);

  const set = (k: keyof typeof values, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const { submit, pending, formError, fieldErrors } = useFormAction({
    // `order.updatedAt` is the row this form was built from. Sending it turns a
    // save into "update IF nothing changed since" — the check writes.ts has
    // been carrying an unused parameter for, waiting for a screen that opens an
    // order long enough for someone else to touch it. This is that screen.
    action: (input: Record<string, unknown>) =>
      updateOrderAction(order.id, input, order.updatedAt),
    successMessage: t("orders.updated"),
    errorMessages: {
      "unknown-sku": t("orders.errUnknownSku"),
      "sku-inactive": t("orders.errSkuInactive"),
      "quantity-locked": t("orders.errQuantityLocked"),
      "not-editable": t("orders.errNotEditable"),
      "too-late": t("orders.errTooLate"),
      conflict: t("orders.errConflict"),
    },
    onSuccess: () => router.refresh(),
  });

  const label = order.externalId ?? `#${order.id}`;
  // Quantity has its OWN lock, tighter than the page's: it is money that has
  // already moved at assign-time, so it closes at PENDING even for staff who
  // may still edit everything else here.
  const quantityLocked = order.status !== "PENDING";

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/orders" />}
            >
              <ArrowLeft className="size-4" aria-hidden />
              {t("orders.detail.back")}
            </Button>
            <h1 className="font-mono text-(length:--fs-body-lg) font-medium tracking-(--ls-mono) text-(--text-strong)">
              {label}
            </h1>
            <StatusBadge status={order.status}>
              {t(`orders.statuses.${order.status}`)}
            </StatusBadge>
          </div>

          {/* WHY the form is read-only, said once, at the top. A page full of
              greyed inputs with no sentence explaining them reads as a bug.
              Only "too-late" is explained in terms of the order — "role" means
              this person was never going to be able to edit it, and telling
              them about production would be answering a question they did not
              ask. */}
          {!policy.editable && (
            <p className="flex items-start gap-2 rounded-(--radius-card) bg-(--surface-shell) p-3 text-(length:--fs-body-sm) text-(--text-muted)">
              <Lock className="mt-0.5 size-4 shrink-0 stroke-(--icon-muted)" aria-hidden />
              {t(
                policy.reason === "too-late"
                  ? policy.wide
                    ? "orders.detail.lockedProduction"
                    : "orders.detail.lockedSeller"
                  : "orders.detail.lockedRole",
              )}
            </p>
          )}

          <div className="flex flex-col gap-4 rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-data) p-4 shadow-(--shadow-xs)">
            <OrderFormFields
              values={values}
              set={set}
              fieldErrors={fieldErrors}
              quantityLocked={quantityLocked}
              disabled={!policy.editable}
            />

            {formError && (
              <p className="text-(length:--fs-body-sm) text-(--status-critical-fg)">{formError}</p>
            )}

            {policy.editable && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setValues(valuesFromOrder(order))}
                  disabled={pending}
                >
                  {t("orders.detail.reset")}
                </Button>
                <Button
                  disabled={pending || !isSubmittable(values)}
                  onClick={() =>
                    submit({
                      ...values,
                      // Exactly what was typed — 0 and blank included, so the
                      // server's own validation is the one that fires.
                      quantity: Number(values.quantity),
                    })
                  }
                >
                  {t("orders.detail.save")}
                </Button>
              </div>
            )}
          </div>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
          <Panel title={t("orders.detail.artwork")}>
            {shots.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {shots.map((shot, i) => (
                  <button
                    key={shot.src}
                    type="button"
                    onClick={() => setLightbox(i)}
                    aria-label={t(SHOT_CAPTION[shot.kind])}
                    className="aspect-square overflow-hidden rounded-(--radius-xs) border border-(--border-hairline) bg-(--cream-200) transition-opacity duration-(--dur-fast) hover:opacity-75 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shot.src} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-(length:--fs-body-sm) text-(--text-muted)">
                {t("orders.detail.noArtwork")}
              </p>
            )}
          </Panel>

          <Panel title={t("orders.detail.product")}>
            <Row label={t("orders.colProduct")} value={order.productName ?? "—"} />
            <Row label={t("orders.fSku")} value={order.sku ?? "—"} mono />
            <Row label={t("orders.qr.variant")} value={order.variantName ?? "—"} />
            <Row
              label={t("orders.colQty")}
              value={order.filled > 0 ? `${order.filled}/${order.quantity}` : String(order.quantity)}
              mono
            />
            <Row label={t("orders.colCost")} value={money(order.baseCost)} mono />
          </Panel>

          {order.tracking && (
            <Panel title={t("orders.colTracking")}>
              <Row label={t("orders.colTracking")} value={order.tracking} mono />
              <Row
                label={t("orders.detail.carrier")}
                value={[order.carrier, order.service].filter(Boolean).join(" · ") || "—"}
              />
              <Row label={t("orders.detail.trackingStatus")} value={order.trackingStatus ?? "—"} />
            </Panel>
          )}

          <Panel title={t("orders.timeline.toggle")}>
            <OrderTimeline orderId={order.id} />
          </Panel>
        </aside>
      </div>

      {lightbox !== null && (
        <ArtworkLightbox
          shots={shots}
          index={lightbox}
          onIndexChange={setLightbox}
          label={label}
          open
          onOpenChange={(o) => !o && setLightbox(null)}
        />
      )}
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-(--radius-card) border border-(--border-hairline) bg-(--surface-data) p-4 shadow-(--shadow-xs)">
      <h2 className="text-(length:--fs-meta) font-bold tracking-(--ls-caps) uppercase text-(--text-label)">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-(length:--fs-meta) text-(--text-muted)">{label}</span>
      <span
        className={`min-w-0 text-right text-(length:--fs-body-sm) text-(--text-body) ${
          mono ? "font-mono tracking-(--ls-mono)" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
