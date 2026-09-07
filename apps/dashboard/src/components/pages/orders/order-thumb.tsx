"use client";

import { useState, type ReactNode } from "react";
import { FolderOpen, Image as ImageIcon, Package } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

/**
 * The order row's pictures — which one exists, and how each one is drawn.
 *
 * "The order's image" is three different things wearing one name, and this
 * module is where that is decided ONCE for the table, the phone card and the
 * code panel. The row shape is declared structurally rather than importing
 * `OrderRow` from orders-table.tsx: that file imports `Thumb` from here at
 * RUNTIME, and a value cycle between the two is a real one, not a lint opinion.
 */
export type ArtworkRow = {
  id: number;
  /** The mockup's stored image endpoint, when a mockup row exists at all. */
  mockupThumbnail: string | null;
  /** The Drive folder the mockup was RESOLVED out of, or null when somebody
   * attached it by hand through the artwork dialog. */
  mockupFolderId: string | null;
  /** "unresolved" once a folder has been tried and found unreadable. */
  mockupStatus: string | null;
  /** The design's own folder id, parsed off `imageUrl` on the server. Null
   * when `imageUrl` is not a Drive link (or is absent). */
  designFolderId: string | null;
  imageUrl: string | null;
};

/**
 * What the D slot should draw. Four cases, and they are not interchangeable:
 *
 *   merged  The mockup was resolved OUT OF this order's design folder, so the
 *           design and the mockup are literally the same picture. One
 *           thumbnail, tagged D, linking to the FOLDER — that is still where a
 *           human goes to look at all the print files. The M slot is suppressed
 *           for the row, because two identical 32px squares side by side is
 *           noise, not information.
 *   resolve Nothing has resolved this folder yet. /api/orders/<id>/thumb
 *           resolves it on demand AND writes the answer back, so the next page
 *           load reads a plain column and never asks the route again.
 *   folder  A folder we cannot turn into a picture — either already tried and
 *           remembered as unresolved, or one whose mockup came from somewhere
 *           else entirely. The folder icon is the honest answer, and the stored
 *           failure exists precisely to stop us re-fetching.
 *   image   `imageUrl` is not a Drive link at all — an uploaded image, which
 *           has always been rendered as itself.
 *
 * Running `npm run db:backfill:mockups` from libs/db resolves every folder in
 * bulk, which turns `resolve` into `merged` for the whole table in one pass.
 */
export type DesignSlot =
  | { kind: "merged"; src: string; href: string }
  | { kind: "resolve"; src: string; href: string }
  | { kind: "folder"; href: string }
  | { kind: "image"; src: string }
  | null;

export function designSlot(order: ArtworkRow): DesignSlot {
  // Not a Drive folder: either an ordinary uploaded image, or nothing at all.
  if (!order.designFolderId || !order.imageUrl) {
    return order.imageUrl ? { kind: "image", src: order.imageUrl } : null;
  }
  const href = order.imageUrl;

  // The mockup came out of THIS folder — same picture, so draw it once.
  if (order.mockupThumbnail && order.mockupFolderId === order.designFolderId) {
    return { kind: "merged", src: order.mockupThumbnail, href };
  }

  // No mockup row of any kind: nobody has looked in this folder yet, so the
  // lazy route gets to. Anything else (a hand-attached mockup, a remembered
  // failure, a mockup resolved from a different folder) means the folder still
  // has no picture we can show, and asking the route again would either 404 or
  // hand back the hand-attached mockup — which is NOT the design.
  const untouched =
    order.mockupThumbnail === null &&
    order.mockupFolderId === null &&
    order.mockupStatus === null;
  return untouched
    ? { kind: "resolve", src: `/api/orders/${order.id}/thumb`, href }
    : { kind: "folder", href };
}

/**
 * The best single image of the order's artwork, or null.
 *
 * Used by the code panel's image tab and the phone card. A stored thumbnail
 * wins; otherwise only an unresolved folder is worth a round-trip. The earlier
 * version returned the resolve route for EVERY Drive link, including folders
 * already recorded as unreadable — one request per row that 404s every time.
 */
export function thumbSrc(order: ArtworkRow): string | null {
  if (order.mockupThumbnail) return order.mockupThumbnail;
  const slot = designSlot(order);
  if (slot?.kind === "resolve" || slot?.kind === "image") return slot.src;
  return null;
}

/**
 * The cream well every artwork square sits in.
 *
 * Cream, never grey — the DS's rule for anything holding a product image, and
 * most of what keeps a GWP table from looking like every other admin.
 *
 * It answers `data-density` from the DataTable root rather than taking a size
 * prop: the page owns its own cells, so shrinking the thumbnail when the table
 * goes compact is the page's job, and the group variant does it with no
 * prop-drilling and no re-render. A compact row is then genuinely denser rather
 * than merely shorter.
 */
export const WELL =
  "size-8 shrink-0 rounded-(--radius-xs) bg-(--cream-200) " +
  "group-data-[density=compact]/data-table:size-6 " +
  "group-data-[density=full]/data-table:size-10";

/**
 * The one-letter corner chip. A CHIP, not a colour: four thumbnails told apart
 * only by hue would be unreadable to anyone who does not see the hues, and
 * would need a legend nobody reads. The full word is the accessible name on the
 * image itself.
 */
const TAG =
  "absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center " +
  "rounded-(--radius-pill) bg-(--navy-700) font-mono text-[0.5625rem] leading-none " +
  "font-bold text-(--gwp-white)";

/**
 * Anything that occupies a tagged slot in the strip — an image, or the folder
 * icon that stands in for a design we cannot draw. Exported so the chip is
 * defined exactly once: a folder well wearing a hand-rolled copy of the same
 * absolute-positioned square is how the two drift apart by a pixel.
 */
export function TaggedWell({ tag, children }: { tag: string; children: ReactNode }) {
  return (
    <span className="relative block shrink-0">
      {children}
      <span aria-hidden className={TAG}>
        {tag}
      </span>
    </span>
  );
}

/**
 * One image in the order row's strip, corner-tagged so the four are told apart
 * at a glance: D design · M mockup · L shipping label · P packing proof.
 *
 * A load failure is handled here rather than left to the browser: every source
 * is third-party (a Drive file whose sharing can change, a carrier's label
 * host), and a broken-image glyph in a dense table reads as "the app is
 * broken". The default degrade is an empty well, which reads as "no picture" —
 * the truth — and keeps its tag so the row still says which slot came up empty.
 * `fallback` overrides that for the one case with a better answer: a design
 * whose lazy resolve 404s degrades to the folder icon, never to a blank.
 *
 * `loading="lazy"` and `decoding="async"` on every one of them, because up to
 * four per row across 25 rows was ~100 eager third-party Drive requests fired
 * on page load.
 */
export function Thumb({
  src,
  tag,
  label,
  ring,
  fallback,
}: {
  src: string;
  tag: string;
  label: string;
  /** Distinguishing ring — the packing proof wears one so it is never mistaken
   * for the artwork beside it. */
  ring?: string;
  /** Drawn instead of the empty well when the source fails to load. */
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <TaggedWell tag={tag}>
      {failed ? (
        (fallback ?? (
          <span className={cn(WELL, "flex items-center justify-center")}>
            <ImageIcon className="size-4 stroke-(--icon-muted)" aria-hidden />
            <span className="sr-only">{label}</span>
          </span>
        ))
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cn(WELL, "object-cover", ring)}
        />
      )}
    </TaggedWell>
  );
}

/**
 * The artwork square for the phone card — one image, no tag strip.
 *
 * Same four cases as the table, minus the links: this renders INSIDE the button
 * that opens the code panel, and an <a> inside a <button> is invalid markup. So
 * the folder case draws the folder icon here, and the panel it opens carries
 * "open the original", which is where the folder link belongs.
 */
export function OrderThumb({
  order,
  className = "size-10",
}: {
  order: ArtworkRow;
  className?: string;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const slot = designSlot(order);
  const src = thumbSrc(order);

  if (!src || failed) {
    const isFolder = slot?.kind === "folder" || slot?.kind === "resolve";
    return (
      <span
        title={t(isFolder ? "orders.thumb.designFolder" : "orders.thumb.mockup")}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-(--radius-xs) bg-(--surface-content)",
          className,
        )}
      >
        {isFolder ? (
          <FolderOpen className="size-4 stroke-(--icon-default)" aria-hidden />
        ) : (
          <Package className="size-4 stroke-(--icon-muted)" aria-hidden />
        )}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      title={t(slot?.kind === "merged" ? "orders.thumb.designInFolder" : "orders.thumb.mockup")}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn(
        "shrink-0 rounded-(--radius-xs) bg-(--surface-content) object-cover",
        className,
      )}
    />
  );
}

/**
 * One picture attached to an order, as the artwork panel needs it.
 *
 * `src` is what an <img> can render; `href` is where the ORIGINAL lives, which
 * for a design resolved out of Drive is a FOLDER — a page for a human, never an
 * image source. Keeping the two apart is what lets the panel show the artwork
 * and still offer "open the folder" without ever putting a folder in an <img>.
 */
export type ArtworkShot = {
  kind: "design" | "mockup" | "label" | "proof";
  src: string;
  href?: string | null;
  /** `href` is a folder rather than the file itself. */
  folder?: boolean;
};

/** The i18n key naming each slot. `proof` sits under a different parent than
 *  the other three, so this is written out rather than interpolated. */
export const SHOT_CAPTION: Record<ArtworkShot["kind"], string> = {
  design: "orders.thumb.design",
  mockup: "orders.thumb.mockup",
  label: "orders.thumb.label",
  proof: "orders.proof.thumb",
};

/**
 * Every picture on the order, in the order the strip draws them.
 *
 * Built on designSlot so the panel and the strip cannot disagree about which
 * cases have a picture at all: `merged` and `resolve` do, `folder` does not —
 * that is the whole point of remembering a folder we could not read — and
 * `image` is one already. A `folder` row therefore contributes NO shot, and the
 * strip keeps its plain link out, because a panel with nothing in it is not
 * somewhere to trap a person.
 */
export function orderShots(order: ArtworkRow & {
  labelUrl: string | null;
  proofImageUrl: string | null;
}): ArtworkShot[] {
  const slot = designSlot(order);
  const shots: ArtworkShot[] = [];

  if (slot?.kind === "merged" || slot?.kind === "resolve") {
    shots.push({ kind: "design", src: slot.src, href: slot.href, folder: true });
  } else if (slot?.kind === "image") {
    shots.push({ kind: "design", src: slot.src, href: slot.src });
  }
  // Suppressed when the design slot already IS the mockup — the same rule the
  // strip applies, for the same reason: one picture, drawn once.
  if (order.mockupThumbnail && slot?.kind !== "merged") {
    shots.push({ kind: "mockup", src: order.mockupThumbnail, href: order.mockupThumbnail });
  }
  if (order.labelUrl) shots.push({ kind: "label", src: order.labelUrl, href: order.labelUrl });
  if (order.proofImageUrl) {
    shots.push({ kind: "proof", src: order.proofImageUrl, href: order.proofImageUrl });
  }
  return shots;
}

/** Where a slot sits in the gallery, or -1 when there is no such picture — the
 *  strip opens the panel ON the thumbnail that was pressed. */
export const shotIndex = (shots: ArtworkShot[], kind: ArtworkShot["kind"]) =>
  shots.findIndex((s) => s.kind === kind);
