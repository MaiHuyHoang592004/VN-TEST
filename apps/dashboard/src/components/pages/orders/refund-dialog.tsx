"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Textarea } from "@/components/ui/textarea";
import { FormDialog, FormField, useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { refundOrdersAction, refundQuoteAction } from "@/modules/fulfillment/orders/actions";
import { money } from "@/lib/money";

type Quote = {
  lines: {
    orderId: number;
    externalId: string | null;
    baseCost: string;
    shippingCost: string;
    total: string;
    blocked: "not-paid" | "cancelled" | "already-refunded" | null;
  }[];
  total: string;
  unknown: number;
};

/**
 * Giving money back, with the arithmetic on screen first.
 *
 * The sibling of AssignDialog and deliberately shaped like it: the only two
 * screens that move someone else's money both show what will happen before
 * they do it, both quote through the SAME function the service uses, and both
 * generate one idempotency key when they open so a double-click cannot pay
 * twice.
 *
 * Orders that cannot be refunded are listed with the reason rather than hidden
 * — an operator who selected twelve rows and refunds nine needs to know which
 * three, and why.
 */
export function RefundDialog({
  orderIds,
  open,
  onOpenChange,
  onDone,
}: {
  orderIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [quote, setQuote] = useState<Quote | null>(null);
  /** A quote that FAILED, as opposed to one still running — see AssignDialog:
   * an uncaught rejection left this money dialog on "Calculating…" with both
   * buttons dead. */
  const [quoteError, setQuoteError] = useState(false);
  const [reason, setReason] = useState("");
  // Generated ONCE per dialog. Regenerating per submit would defeat the point.
  const [idempotencyKey] = useState(() => `refund-${Date.now()}-${crypto.randomUUID()}`);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    refundQuoteAction(orderIds)
      .then((q) => {
        if (!cancelled) setQuote(q as Quote);
      })
      .catch(() => {
        if (!cancelled) setQuoteError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderIds]);

  const refundable = quote?.lines.filter((l) => !l.blocked) ?? [];
  const blocked = quote?.lines.filter((l) => l.blocked) ?? [];

  const { submit, pending, formError } = useFormAction({
    action: () => refundOrdersAction({ orderIds, idempotencyKey, reason }),
    successMessage: t("orders.refundDone"),
    onSuccess: () => {
      onOpenChange(false);
      onDone();
      router.refresh();
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("orders.refundTitle")}
      description={t("orders.refundDesc")}
      submitLabel={t("orders.refundSubmit")}
      destructive
      // `pending` disables Cancel too, so it means "the refund is being sent",
      // never "the quote is still loading" — the latter belongs here.
      pending={pending}
      submitDisabled={!quote || quoteError || refundable.length === 0}
      formError={formError}
      footerHint={quote ? `${t("orders.refundTotal")}: ${money(quote.total)}` : undefined}
      onSubmit={() => submit(undefined as never)}
    >
      {quoteError ? (
        <p role="alert" className="text-destructive text-sm">
          {t("orders.refundQuoteFailed")}
        </p>
      ) : !quote ? (
        <p className="text-muted-foreground text-sm">{t("orders.assignCalculating")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {refundable.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("orders.refundNothing")}</p>
          ) : (
            <div className="border-border divide-border max-h-56 divide-y overflow-y-auto rounded-md border">
              {refundable.map((line) => (
                <div
                  key={line.orderId}
                  className="flex items-center justify-between gap-3 p-2.5 text-sm"
                >
                  <span className="truncate font-mono text-xs">
                    {line.externalId ?? `#${line.orderId}`}
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="font-mono">{money(line.total)}</span>
                    {Number(line.shippingCost) > 0 && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        ({money(line.baseCost)} + {money(line.shippingCost)})
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {blocked.length > 0 && (
            <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
              {blocked.map((line) => (
                <li key={line.orderId}>
                  {line.externalId ?? `#${line.orderId}`} —{" "}
                  {t(`profile.billing.blocked.${line.blocked}`)}
                </li>
              ))}
            </ul>
          )}

          {quote.unknown > 0 && (
            <p className="text-muted-foreground text-xs">
              {t("orders.assignSkipped").replace("{count}", String(quote.unknown))}
            </p>
          )}
        </div>
      )}

      <FormField label={t("orders.refundReason")}>
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("orders.refundReasonPlaceholder")}
          />
        )}
      </FormField>
    </FormDialog>
  );
}
