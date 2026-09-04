"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Package } from "lucide-react";
import type { FulfillmentStatus } from "@gwprint/db";

import { StatusBadge, Surface } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n";
// Pure data with a type-only import — safe in a client component, which is
// exactly why the transition map was built as data rather than a switch.
import { allowedTransitions } from "@/modules/fulfillment/orders/status";
import { updateStatusAction } from "@/modules/fulfillment/orders/actions";
import { fillOrderAction, refreshGroupAction } from "@/modules/fulfillment/stations/actions";

import type { StationGroup } from "./station";

/** One card per piece in the parcel: what to make, how many are made, and the
 * two things an operator does to it — fill, or move its status. */
export function OrderCardGrid({
  group,
  onGroup,
  onBlocked,
}: {
  group: StationGroup;
  onGroup: (group: StationGroup) => void;
  onBlocked: (message: string | null) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {group.orders.map((order) => (
        <OrderCard key={order.id} order={order} onGroup={onGroup} onBlocked={onBlocked} />
      ))}
    </div>
  );
}

function OrderCard({
  order,
  onGroup,
  onBlocked,
}: {
  order: StationGroup["orders"][number];
  onGroup: (group: StationGroup) => void;
  onBlocked: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const remaining = Math.max(0, order.quantity - order.filled);
  const [amount, setAmount] = useState(remaining || 1);
  const [pending, setPending] = useState(false);
  const complete = order.filled >= order.quantity;

  const fill = async () => {
    setPending(true);
    const result = await fillOrderAction({ orderId: order.id, amount });
    setPending(false);

    if ("error" in result) {
      const message = t(`fulfillment.errors.${result.error}`);
      // A missing basket stops the whole bench, so it is a banner that stays
      // until the floor resolves it — not a toast that fades in four seconds.
      if (result.error === "no-available-basket") onBlocked(message);
      else toast.error(message);
      return;
    }
    onBlocked(null);
    onGroup(result.group);
    if (result.basket) {
      toast.success(t("fulfillment.fill.basket").replace("{name}", result.basket.name));
    }
  };

  const move = async (to: FulfillmentStatus) => {
    setPending(true);
    const result = await updateStatusAction(order.id, to);
    setPending(false);
    if (!result.ok) {
      toast.error(t("fulfillment.errors.invalid-transition"));
      return;
    }
    toast.success(
      t("orders.statusMoved").replace("{count}", "1").replace("{status}", t(`orders.statuses.${to}`)),
    );
    // Ask the server what the parcel looks like now. Patching the card locally
    // would leave the screen a guess, and the guess is what the next operator
    // acts on.
    const fresh = await refreshGroupAction({ orderId: order.id });
    if (fresh) onGroup(fresh);
  };

  const options = allowedTransitions(order.status as FulfillmentStatus);

  return (
    <Surface level="data" radius="card" shadow="sm" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {order.mockupThumb || order.designUrl ? (
          // The design a customer prints. Click opens it full size — a packer
          // comparing a print to a screen needs more than 40 pixels.
          <a
            href={order.designUrl ?? order.mockupThumb ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.mockupThumb ?? order.designUrl ?? ""}
              alt=""
              className="size-14 rounded-(--radius-card) border border-(--border-soft) object-cover transition-transform hover:scale-105 motion-reduce:transition-none"
            />
          </a>
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-(--radius-card) bg-(--surface-inset) text-(--icon-muted)">
            <Package className="size-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-(length:--fs-body) font-semibold text-(--text-strong)">
            {order.variant ?? "—"}
          </p>
          {/* Product name is prose; the SKU is an identifier, so only the SKU
              takes the mono face. */}
          <p className="truncate font-sans text-(length:--fs-body-sm) text-(--text-muted)">
            {order.product ?? "—"}
            {order.sku ? (
              <>
                {" · "}
                <span className="font-mono">{order.sku}</span>
              </>
            ) : null}
          </p>
          <p className="mt-1 truncate font-mono text-(length:--fs-meta) text-(--text-muted)">
            {order.externalId ?? `#${order.id}`}
          </p>
        </div>

        <div className="text-right">
          <p className="font-display text-(length:--fs-display-sm) leading-none font-(--fw-display-heavy) tabular-nums text-(--display-kpi)">
            {order.quantity}
          </p>
          <p className="font-sans text-(length:--fs-micro) font-semibold tracking-(--ls-label) text-(--text-label) uppercase">
            {t("fulfillment.card.qty")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Every status is a StatusBadge, tone derived from the literal
            backend value — never a hand-picked Badge variant. */}
        <StatusBadge status={order.status}>
          {t(`orders.statuses.${order.status}`)}
        </StatusBadge>
        {/* "filled" is derived from the counter, not a backend status, so it
            carries an explicit tone rather than going through toneFor(). */}
        {complete && (
          <StatusBadge status="filled" tone="success" dot={false} className="gap-1">
            <Check className="size-3" />
            {t("fulfillment.card.filled")}
          </StatusBadge>
        )}
        {order.basket && (
          <span className="font-sans text-(length:--fs-meta) text-(--text-muted)">
            {order.basket.name}
          </span>
        )}
      </div>

      {/* Progress, not a status: "filled" is derived from the counter. */}
      <div>
        <div className="mb-1 flex justify-between font-sans text-(length:--fs-meta) text-(--text-muted)">
          <span>{t("fulfillment.card.progress")}</span>
          <span className="font-mono tabular-nums">
            {order.filled}/{order.quantity}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-(--radius-pill) bg-(--surface-inset)">
          <div
            className={`h-full rounded-(--radius-pill) transition-all motion-reduce:transition-none ${complete ? "bg-(--status-success-dot)" : "bg-sky-500"}`}
            style={{ width: `${Math.min(100, (order.filled / order.quantity) * 100)}%` }}
          />
        </div>
      </div>

      {(order.note || order.internalNote) && (
        <div className="space-y-1 font-sans text-(length:--fs-meta)">
          {order.note && <p className="text-(--text-muted)">{order.note}</p>}
          {order.internalNote && (
            <p className="text-(--status-attention-fg)">{order.internalNote}</p>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={remaining || 1}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
          disabled={complete || order.status !== "IN_PRODUCTION"}
          aria-label={t("fulfillment.card.fillAmount")}
          className="h-12 w-24 font-mono tabular-nums"
        />
        <Button
          size="lg"
          onClick={fill}
          disabled={pending || complete || order.status !== "IN_PRODUCTION"}
          className="flex-1"
        >
          {t("fulfillment.card.fill")}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-lg"
                disabled={pending || options.length === 0}
              />
            }
          >
            <ChevronDown className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {options.map((s) => (
              <DropdownMenuItem
                key={s}
                variant={s === "CANCELLED" ? "destructive" : undefined}
                onClick={() => move(s)}
              >
                {t(`orders.statuses.${s}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Surface>
  );
}
