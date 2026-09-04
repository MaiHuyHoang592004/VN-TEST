"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, MapPin, TriangleAlert } from "lucide-react";

import { Surface } from "@/components/ds";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

import type { StationGroup } from "./station";

/**
 * What the operator needs to know about the parcel in their hands, above the
 * per-order detail: which parcel, whose, where it is staged, and whether it
 * needs counting.
 */
export function GroupSummary({ group }: { group: StationGroup }) {
  const { t } = useTranslation();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const proof = group.orders.find((o) => o.proofImageUrl)?.proofImageUrl ?? null;

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(t("fulfillment.group.copied"));
  };

  return (
    <Surface level="data" radius="card" shadow="sm" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans text-(length:--fs-micro) font-semibold tracking-(--ls-label) text-(--text-label) uppercase">
            {t("fulfillment.group.tracking")}
          </p>
          <div className="flex items-center gap-2">
            <p className="truncate font-mono text-(length:--fs-body-lg) font-semibold text-(--text-strong)">
              {group.trackingNumber ?? group.externalIdPrefix ?? "—"}
            </p>
            {(group.trackingNumber ?? group.externalIdPrefix) && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("fulfillment.group.copy")}
                onClick={() => copy(group.trackingNumber ?? group.externalIdPrefix ?? "")}
              >
                <Copy className="size-3.5" />
              </Button>
            )}
          </div>
          <p className="mt-1 font-sans text-(length:--fs-body) text-(--text-muted)">
            {group.customer.name ?? t("fulfillment.group.noCustomer")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {group.basket && (
            <Badge variant="secondary" className="gap-1">
              <MapPin className="size-3.5 stroke-navy-600" />
              {group.basket.name}
            </Badge>
          )}
          {group.labelUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(group.labelUrl!, "_blank", "noopener")}
            >
              <ExternalLink className="size-3.5" />
              {t("fulfillment.group.openLabel")}
            </Button>
          )}
          {proof && (
            <button
              type="button"
              onClick={() => setLightbox(proof)}
              className="size-10 overflow-hidden rounded-(--radius-card) border border-(--border-soft)"
              aria-label={t("fulfillment.group.viewProof")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proof} alt="" className="size-full object-cover" />
            </button>
          )}
        </div>
      </div>

      {/* The legacy red-highlight rule: more than one piece in a box is where
          short-shipments come from, so it is the loudest thing on the screen. */}
      {group.isMultiUnit && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-(--radius-card) border border-(--status-critical-bg) bg-(--status-critical-bg) px-3 py-2 font-sans text-(length:--fs-body) font-semibold text-(--status-critical-fg)"
        >
          <TriangleAlert className="size-4 shrink-0" />
          {t("fulfillment.group.multiUnit")}
        </p>
      )}

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("fulfillment.group.viewProof")}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--overlay-scrim) p-8"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-h-full max-w-full rounded-(--radius-card) object-contain"
          />
        </div>
      )}
    </Surface>
  );
}
