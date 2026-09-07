"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, FolderOpen, ImageOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";

import { SHOT_CAPTION, type ArtworkShot } from "./order-thumb";

/**
 * The order's artwork, full size, without leaving the table.
 *
 * Thumbnails in the ORDER column are 32px, which answers "is there artwork"
 * and never "is it the RIGHT artwork" — the question a packer actually has.
 * Answering it used to mean a new browser tab on Drive or on the carrier's
 * label host, i.e. losing the table, the scroll position and the selection.
 *
 * So the row's pictures open HERE, as a gallery rather than one image: design,
 * mockup, label and packing proof are the four things somebody compares
 * against each other, and comparing them is the entire reason the row carries
 * all four. ← / → step between them; the trigger decides which one opens.
 *
 * Zoom is a toggle, not a slider. "Does this fit the frame" and "show me the
 * real pixels" are the only two states anyone wants from a proof check, and a
 * click is cheaper than a control.
 */
export function ArtworkLightbox({
  shots,
  index,
  onIndexChange,
  open,
  onOpenChange,
  label,
}: {
  shots: ArtworkShot[];
  index: number;
  onIndexChange: (next: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The order this artwork belongs to — the dialog's subtitle. */
  label: string;
}) {
  const { t } = useTranslation();

  const count = shots.length;
  // An index can outlive the array it points into: a row re-renders with its
  // proof photo gone while the panel is open. Clamp rather than crash.
  const safeIndex = count === 0 ? 0 : Math.min(Math.max(index, 0), count - 1);
  const shot = shots[safeIndex];

  const step = (delta: number) => {
    if (count < 2) return;
    onIndexChange((safeIndex + delta + count) % count);
  };

  // ← / → belong to the gallery while it is open. Escape is the dialog's own.
  useEffect(() => {
    if (!open || count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      onIndexChange((safeIndex + (e.key === "ArrowRight" ? 1 : -1) + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count, safeIndex, onIndexChange]);

  if (!shot) return null;

  const caption = t(SHOT_CAPTION[shot.kind]);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={caption}
      description={label}
      className="sm:max-w-4xl"
    >
      <div className="flex flex-col gap-3">
        {/* Cream well, never grey — the DS's rule for anything holding a
            product image, and it doubles as the mat that stops a white mockup
            bleeding into the dialog. */}
        <div className="relative flex min-h-64 items-center justify-center overflow-auto rounded-(--radius-card) bg-(--cream-200) p-2">
          {/* KEYED BY SRC, and that is the reset. Zoom and "this one failed to
              load" belong to the picture on screen, not to the panel: stepping
              to the next shot must start it fit-to-frame and un-failed. A key
              says that in the type system — React discards the old state — where
              an effect calling setState would only say it after a wasted
              render. */}
          <ArtworkFrame key={shot.src} src={shot.src} caption={caption} />

          {count > 1 && (
            <>
              <GalleryStep
                side="left"
                label={t("orders.lightbox.prev")}
                onClick={() => step(-1)}
              >
                <ChevronLeft className="size-5" />
              </GalleryStep>
              <GalleryStep
                side="right"
                label={t("orders.lightbox.next")}
                onClick={() => step(1)}
              >
                <ChevronRight className="size-5" />
              </GalleryStep>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Which of the row's pictures this is, in words and in position.
              A dot strip alone would not say WHICH slot is on screen, and the
              slot is the thing being checked. */}
          <p className="text-(length:--fs-meta) text-(--text-muted)">
            {count > 1
              ? `${caption} · ${t("orders.lightbox.counter")
                  .replace("{index}", String(safeIndex + 1))
                  .replace("{count}", String(count))}`
              : caption}
          </p>

          {shot.href && (
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={shot.href} target="_blank" rel="noopener noreferrer" />
              }
              nativeButton={false}
            >
              {shot.folder ? (
                <FolderOpen className="size-4" aria-hidden />
              ) : (
                <ExternalLink className="size-4" aria-hidden />
              )}
              {t(shot.folder ? "orders.lightbox.openFolder" : "orders.lightbox.openOriginal")}
            </Button>
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}

/**
 * The picture itself, and the two pieces of state that belong to it.
 *
 * Zoom is a TOGGLE rather than a slider: "does this fit the frame" and "show me
 * the real pixels" are the only two questions a proof check asks, and a click
 * is cheaper than a control. A load failure lands here too — every source is
 * third-party (a Drive file whose sharing can change, a carrier's label host),
 * and a broken-image glyph reads as "the app is broken" where a stated reason
 * reads as what actually happened.
 */
function ArtworkFrame({ src, caption }: { src: string; caption: string }) {
  const { t } = useTranslation();
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p className="flex flex-col items-center gap-2 py-16 text-(length:--fs-body-sm) text-(--text-muted)">
        <ImageOff className="size-8 stroke-(--icon-muted)" aria-hidden />
        {t("orders.lightbox.failed")}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setZoomed((z) => !z)}
      aria-label={t(zoomed ? "orders.lightbox.zoomOut" : "orders.lightbox.zoomIn")}
      className={`rounded-(--radius-xs) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none ${
        zoomed ? "cursor-zoom-out" : "cursor-zoom-in"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={caption}
        onError={() => setFailed(true)}
        className={zoomed ? "max-w-none" : "max-h-[70vh] w-auto max-w-full object-contain"}
      />
    </button>
  );
}

/** Prev/next, floated over the image rather than beside it so the picture keeps
 *  the dialog's full width on a laptop screen. */
function GalleryStep({
  side,
  label,
  onClick,
  children,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`absolute top-1/2 -translate-y-1/2 ${
        side === "left" ? "left-2" : "right-2"
      } flex size-9 items-center justify-center rounded-(--radius-pill) bg-(--surface-shell) text-(--icon-default) shadow-(--shadow-sm) transition-colors duration-(--dur-fast) hover:bg-(--surface-data) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none`}
    >
      {children}
    </button>
  );
}
