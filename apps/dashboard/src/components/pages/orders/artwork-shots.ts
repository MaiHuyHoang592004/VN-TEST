/**
 * WHICH pictures an order has, and what each one actually points at.
 *
 * A plain module rather than part of either component that uses it: the table
 * is a client component and /orders/[id] is a server one, and both need the
 * same answer. Deciding it twice is how the two screens end up disagreeing
 * about whether a row has a mockup.
 */

export type ArtworkShot = {
  /** Which slot this came from. Picks the caption. */
  kind: "design" | "mockup" | "label" | "proof";
  /** What an <img> can render. */
  src: string;
  /** Where the ORIGINAL lives, when that is somewhere else — for the design,
   *  a Google Drive FOLDER, which is a page for a human and never an image
   *  source. Keeping the two apart is what lets a panel show the artwork and
   *  still offer "open the folder" without ever putting a folder in an <img>. */
  href?: string | null;
  /** `href` is a folder rather than the file itself. */
  folder?: boolean;
};

/** The i18n key naming each slot. `proof` sits under a different parent than
 *  the other three, so the mapping is written out rather than interpolated. */
export const SHOT_CAPTION: Record<ArtworkShot["kind"], string> = {
  design: "orders.thumb.design",
  mockup: "orders.thumb.mockup",
  label: "orders.thumb.label",
  proof: "orders.proof.thumb",
};

/**
 * True when the url is a Drive FOLDER — a container, never an image.
 *
 * Deliberately a local one-liner rather than the richer `parseDriveUrl` in
 * @gwprint/shared: all a thumbnail needs to know is "can this go in an <img>".
 */
export const driveFolder = (url: string | null) =>
  Boolean(url && url.includes("/drive/folders/"));

/**
 * The order's pictures, in the order a strip should draw them.
 *
 * Two rules earn their keep here:
 *
 * A FOLDER IS NOT A DESIGN. `imageUrl` is a Drive folder on 489 of 489 legacy
 * rows, so the design slot contributes a picture only on the day it holds a
 * real image url. It is still a place you can open — that is the folder well
 * in the strip, and the `href` on the mockup shot.
 *
 * A MISSING MOCKUP IS USUALLY A MOCKUP NOBODY HAS RESOLVED YET.
 * `mockupThumbnail` is null for every order imported since the last backfill,
 * and that is what made the M well vanish from most rows.
 * `/api/orders/<id>/thumb` opens the folder, picks the artwork and WRITES IT
 * BACK, so the first person to look at the row fixes it for everyone after
 * them. Falling back to that route rather than to an empty well is the
 * difference between "no mockup" and "no mockup yet".
 *
 * The two never collide: for a folder row the resolved picture IS the mockup,
 * so it is listed once, as the mockup, carrying the folder as its `href`. One
 * folder, one picture, one Drive link.
 */
export function orderShots(o: {
  id: number;
  imageUrl: string | null;
  mockupThumbnail: string | null;
  labelUrl: string | null;
  proofImageUrl: string | null;
}): ArtworkShot[] {
  const folder = driveFolder(o.imageUrl);
  const design = folder ? null : o.imageUrl;
  const mockup = o.mockupThumbnail ?? (folder ? `/api/orders/${o.id}/thumb` : null);

  const shots: ArtworkShot[] = [];
  if (design) shots.push({ kind: "design", src: design, href: design });
  if (mockup) {
    shots.push({ kind: "mockup", src: mockup, href: folder ? o.imageUrl : mockup, folder });
  }
  if (o.labelUrl) shots.push({ kind: "label", src: o.labelUrl, href: o.labelUrl });
  if (o.proofImageUrl) shots.push({ kind: "proof", src: o.proofImageUrl, href: o.proofImageUrl });
  return shots;
}

/** Where a slot sits in the gallery, or -1 when there is no such picture. A
 *  strip opens the panel ON the thumbnail that was clicked. */
export const shotIndex = (shots: ArtworkShot[], kind: ArtworkShot["kind"]) =>
  shots.findIndex((s) => s.kind === kind);
