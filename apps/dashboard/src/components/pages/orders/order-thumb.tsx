"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { parseDriveUrl } from "@gwprint/shared";

import { useTranslation } from "@/lib/i18n";

/**
 * The 32px square at the head of an order row.
 *
 * It exists because "the order's image" is three different things wearing one
 * name. `mockup.thumbnail` is a real image url, stored once and rendered
 * straight from the orders query — the fast path, and after the backfill the
 * only path most rows take. `imageUrl` is legacy, and it is NOT an image: it
 * is the Google Drive FOLDER the artwork lives in, which is exactly why every
 * thumbnail in this table used to render broken. Feeding it to an <img> asks
 * Drive for a login page and gets one.
 *
 * So: a stored thumbnail is used directly; an unresolved Drive link goes
 * through /api/orders/<id>/thumb, which resolves the folder once and writes
 * the answer back so the next render takes the fast path; and anything else
 * that already looks like an image is trusted as one.
 *
 * Whatever the source, a load failure lands on the placeholder rather than the
 * browser's broken-image icon. A folder can lose its sharing at any time and
 * that is not this table's problem to display.
 */
export function thumbSrc(order: {
  id: number;
  mockupThumbnail: string | null;
  imageUrl: string | null;
}): string | null {
  // Stored: no round-trip, no resolution, just a url from the row.
  if (order.mockupThumbnail) return order.mockupThumbnail;
  // Not yet resolved — an order imported since the last backfill.
  if (parseDriveUrl(order.imageUrl)) return `/api/orders/${order.id}/thumb`;
  // Anything else is either already an image or nothing we can render.
  return order.imageUrl ?? null;
}

export function OrderThumb({
  order,
  className = "size-8",
}: {
  order: { id: number; mockupThumbnail: string | null; imageUrl: string | null };
  className?: string;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const src = thumbSrc(order);

  if (!src || failed) {
    return (
      <span
        className={`flex ${className} shrink-0 items-center justify-center rounded-(--radius-xs) bg-(--surface-content)`}
      >
        <Package className="size-4 stroke-(--icon-muted)" />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      title={t("orders.thumb.mockup")}
      onError={() => setFailed(true)}
      className={`${className} shrink-0 rounded-(--radius-xs) bg-(--surface-content) object-cover`}
    />
  );
}
