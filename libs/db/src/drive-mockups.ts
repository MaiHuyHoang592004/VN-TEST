/**
 * Turning an order's Drive folder link into a stored Mockup — once, ever.
 *
 * Legacy `orders.image_url` holds a Google Drive FOLDER link, not an image, so
 * the orders table rendered a broken thumbnail on every row. Resolving that
 * folder costs an HTTP round-trip to Drive, which is far too expensive to pay
 * on every page render — so we pay it once and write the answer to the
 * `mockups` table the schema already has for exactly this (`folderId`,
 * `thumbnail`, `url`). After that the orders query returns the thumbnail url
 * as a plain column and nothing touches Drive again.
 *
 * Two callers, one path: the lazy route (a new order nobody has resolved yet)
 * and prisma/scripts/backfill-drive-mockups.ts (the 426 folders already in the
 * database). Keeping the logic here is what makes those two agree.
 *
 * A folder we cannot read still gets a Mockup row — status "unresolved",
 * thumbnail null. That is the memo that stops us re-fetching a private or
 * empty folder on every render; the backfill script's --retry-unresolved
 * clears them when the permissions are fixed.
 */
import {
  driveFileUrl,
  driveFolderListUrl,
  driveThumbnailUrl,
  parseDriveUrl,
  parseFolderEntries,
  pickArtworkFile,
} from "@gwprint/shared";

import { prisma } from "./client.ts";

/** Wide enough for the order dialog's preview; the table asks for less. */
export const THUMBNAIL_WIDTH = 400;

/** Drive is a third party on the far side of the internet, not our database. */
const FETCH_TIMEOUT_MS = 8000;

export const MOCKUP_UNRESOLVED = "unresolved";

export type ResolvedMockup = {
  id: number;
  thumbnail: string | null;
  url: string;
  name: string;
  status: string;
};

/**
 * Read a public Drive folder and return the file that IS the artwork.
 *
 * Exported for the backfill script's --dry-run, which reports what it would
 * store without writing anything.
 */
export async function readFolder(folderId: string) {
  const res = await fetch(driveFolderListUrl(folderId), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return pickArtworkFile(parseFolderEntries(await res.text()));
}

/**
 * The stored mockup for an order, resolving and persisting it if this is the
 * first time anyone has asked.
 *
 * Returns null when the order has no Drive link at all. An order whose folder
 * cannot be read comes back with status "unresolved" and a null thumbnail —
 * the caller renders its placeholder, and no further fetch is ever made.
 */
export async function resolveOrderMockup(orderId: number): Promise<ResolvedMockup | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      imageUrl: true,
      mockup: { select: { id: true, thumbnail: true, url: true, name: true, status: true } },
    },
  });
  if (!order) return null;
  // Already resolved — including a remembered failure. Never re-fetch.
  if (order.mockup) return order.mockup;

  const mockup = await resolveFolderMockup(order.imageUrl);
  if (!mockup) return null;

  await prisma.order.update({ where: { id: orderId }, data: { mockupId: mockup.id } });
  return mockup;
}

/**
 * The mockup for a Drive link, created if absent and reused if another order
 * already resolved the same folder — 489 orders share 426 folders, so this
 * dedupe is the difference between 426 fetches and 489.
 *
 * Upsert keyed on `folderId` (unique since the 20260904120000 migration) so two
 * concurrent resolves of one folder cannot become two rows.
 */
export async function resolveFolderMockup(
  imageUrl: string | null,
): Promise<ResolvedMockup | null> {
  const ref = parseDriveUrl(imageUrl);
  if (!ref) return null;

  const select = { id: true, thumbnail: true, url: true, name: true, status: true } as const;

  // A direct file link needs no listing — rare in the legacy data, but the
  // column is free-form and a seller may well paste one.
  if (ref.kind === "file") {
    return prisma.mockup.upsert({
      where: { folderId: ref.id },
      create: {
        folderId: ref.id,
        name: ref.id,
        url: driveFileUrl(ref.id),
        thumbnail: driveThumbnailUrl(ref.id, THUMBNAIL_WIDTH),
      },
      update: {},
      select,
    });
  }

  const existing = await prisma.mockup.findUnique({ where: { folderId: ref.id }, select });
  if (existing) return existing;

  const file = await readFolder(ref.id).catch(() => null);

  return prisma.mockup.upsert({
    where: { folderId: ref.id },
    create: file
      ? {
          folderId: ref.id,
          name: file.name,
          url: driveFileUrl(file.id),
          thumbnail: driveThumbnailUrl(file.id, THUMBNAIL_WIDTH),
        }
      : {
          folderId: ref.id,
          name: ref.id,
          // Keep the folder link: it is still where a human goes to look.
          url: imageUrl ?? driveFolderListUrl(ref.id),
          thumbnail: null,
          status: MOCKUP_UNRESOLVED,
        },
    // Another request won the race while we were on the network. Its answer is
    // as good as ours, so take it rather than overwriting.
    update: {},
    select,
  });
}
