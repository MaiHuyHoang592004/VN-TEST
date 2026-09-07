/**
 * Resolves the Drive FOLDER link every legacy order carries into a stored
 * thumbnail — once, for the whole table.
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types \
 *     prisma/scripts/backfill-drive-mockups.ts [--dry-run] [--retry-unresolved] [--limit=N]
 *
 *   npm run db:backfill:mockups            # local
 *   ENV_FILE=.env.prod SEED_ALLOW_REMOTE=1 npm run db:backfill:mockups:prod
 *
 * WHY IT EXISTS. `orders.image_url` is the folder a seller drops artwork into,
 * not an image (489/489 rows, audited 2026-09-04), so feeding it to an <img>
 * renders a login page — which is exactly what the orders table used to do.
 * src/drive-mockups.ts turns one folder into one Mockup row; this walks the
 * table and pays that cost for every order in one sitting, so the list query
 * afterwards returns a thumbnail as a plain column and no page render ever
 * touches Drive. /api/orders/<id>/thumb stays as the lazy path for orders
 * imported after a run — the two share resolveFolderMockup, which is what
 * keeps them agreeing.
 *
 * PROD IS THE POINT. The legacy rows live there (local starts fresh, see
 * CLAUDE.md), so the usual SEED_ALLOW_REMOTE=1 opt-in is expected here rather
 * than exceptional. It is still required, because "which database am I
 * pointed at" is worth being asked once. `--dry-run` is exempt: it writes
 * nothing, and "what would this do to prod" is a fair question to ask without
 * ceremony.
 *
 * SEQUENTIAL, WITH A PAUSE. 489 orders share 426 folders, and resolveFolderMockup
 * upserts on the unique `folderId`, so a folder is fetched once however many
 * orders point at it. What is left is still ~426 requests to somebody else's
 * service. They go one at a time with a small delay rather than in parallel:
 * the run costs a couple of minutes either way, and a rate-limited burst does
 * not merely fail — it writes `unresolved` memos over folders that were
 * perfectly readable, and those stop us ever asking again until someone runs
 * --retry-unresolved.
 *
 * IDEMPOTENT. Only orders with no mockup are touched, and the mockup itself is
 * an upsert. Re-running after an interrupted pass resumes; re-running after a
 * finished one does nothing and says so.
 *
 * FLAGS.
 *   --dry-run            report what would be stored, write nothing.
 *   --retry-unresolved   re-read the folders remembered as unreadable first,
 *                        for when someone has fixed the sharing on them.
 *   --limit=N            at most N rows PER PASS — a small first run against
 *                        prod tells you the folders are still readable before
 *                        you commit to four hundred requests.
 */
import { driveFileUrl, driveThumbnailUrl, parseDriveUrl } from "@gwprint/shared";

import { prisma } from "../../src/client.ts";
import {
  MOCKUP_UNRESOLVED,
  THUMBNAIL_WIDTH,
  readFolder,
  resolveFolderMockup,
} from "../../src/drive-mockups.ts";

const url = process.env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const host = url.replace(/:[^:@/]+@/, ":***@").replace(/\?.*/, "");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const retryUnresolved = args.includes("--retry-unresolved");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : undefined;

const KNOWN_FLAGS = ["--dry-run", "--retry-unresolved"];
const unknown = args.filter((a) => !KNOWN_FLAGS.includes(a) && !a.startsWith("--limit="));
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(", ")}`);
  console.error("Usage: backfill-drive-mockups.ts [--dry-run] [--retry-unresolved] [--limit=N]");
  process.exit(1);
}
if (limitArg && (!Number.isInteger(limit) || (limit as number) < 1)) {
  console.error(`--limit wants a positive whole number, got "${limitArg.slice(8)}".`);
  process.exit(1);
}

// Same opt-in the seed and import scripts use — one variable to know, and one
// you cannot arrive at by pressing up-arrow in a shell. A dry run reads only,
// so it is allowed to look at any database it is pointed at.
if (!isLocal && !dryRun && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error(`Refusing to backfill: ${host} is not a local database.`);
  console.error("This script is MEANT for prod (the legacy folders live there).");
  console.error("Set SEED_ALLOW_REMOTE=1 to confirm, or pass --dry-run to look first.");
  process.exit(1);
}
if (!isLocal) {
  console.warn(`\n⚠  REMOTE DATABASE: ${host}`);
  if (!dryRun) console.warn(`⚠  This changes data that real signed-in users will see.\n`);
  else console.warn(`⚠  --dry-run: reading only, nothing will be written.\n`);
}

/** What the Mockup row's `status` says once a folder has resolved — the
 * schema's own default, restated here because --retry-unresolved has to write
 * it back over MOCKUP_UNRESOLVED. */
const MOCKUP_ACTIVE = "active";

/** Between two Drive requests. 426 folders × 250ms is about two minutes, which
 * is a fine price for not being the reason a shared Google endpoint starts
 * refusing us. */
const DELAY_MS = 250;

/** How often the progress line is printed. Often enough to see it moving, not
 * so often that the log is the slowest part of the run. */
const LOG_EVERY = 25;

const pause = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

/**
 * Give every remembered failure another chance.
 *
 * An unreadable folder is STORED as a Mockup row with status "unresolved" and
 * a null thumbnail — that memo is what stops the lazy route re-fetching a
 * private folder on every render. Which means a folder whose sharing has since
 * been fixed will never be looked at again on its own: this pass is the only
 * thing that clears the memo.
 */
async function retryUnresolvedMockups() {
  const rows = await prisma.mockup.findMany({
    where: { status: MOCKUP_UNRESOLVED, folderId: { not: null } },
    select: { id: true, folderId: true, name: true },
    orderBy: { id: "asc" },
    ...(limit ? { take: limit } : {}),
  });
  console.log(`retry: ${rows.length} unresolved mockup(s) to re-read`);

  let fixed = 0;
  let stillUnreadable = 0;
  for (const [index, row] of rows.entries()) {
    const file = await readFolder(row.folderId as string).catch(() => null);
    await pause();

    if (!file) {
      stillUnreadable++;
    } else if (dryRun) {
      fixed++;
      console.log(`   would resolve mockup #${row.id} → ${file.name} (${file.id})`);
    } else {
      await prisma.mockup.update({
        where: { id: row.id },
        data: {
          name: file.name,
          url: driveFileUrl(file.id),
          thumbnail: driveThumbnailUrl(file.id, THUMBNAIL_WIDTH),
          status: MOCKUP_ACTIVE,
        },
      });
      fixed++;
    }
    if ((index + 1) % LOG_EVERY === 0) {
      console.log(`   … ${index + 1}/${rows.length} · ${fixed} resolved · ${stillUnreadable} still unreadable`);
    }
  }
  console.log(`retry: ${fixed} resolved, ${stillUnreadable} still unreadable`);
}

/**
 * The backfill proper: every order that has a design link and no mockup.
 *
 * `mockupId: null` is what makes a re-run cheap — an order resolved by an
 * earlier pass, or by the lazy route in the meantime, is not selected at all.
 */
async function linkOrders() {
  const orders = await prisma.order.findMany({
    where: { deletedAt: null, mockupId: null, imageUrl: { not: null } },
    select: { id: true, externalId: true, imageUrl: true },
    orderBy: { id: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  // Which folders we ALREADY hold a mockup for. Nothing to do with
  // correctness — resolveFolderMockup would find them itself — but it tells
  // this script which orders are about to cost a network round-trip, so the
  // delay is paid only where there is something to be polite about, and the
  // progress line can say what the run is actually doing.
  const folderIds = [
    ...new Set(
      orders.map((o) => parseDriveUrl(o.imageUrl)?.id).filter((id): id is string => Boolean(id)),
    ),
  ];
  const known = new Set(
    (
      await prisma.mockup.findMany({
        where: { folderId: { in: folderIds } },
        select: { folderId: true },
      })
    ).map((m) => m.folderId as string),
  );

  console.log(
    `orders: ${orders.length} to link · ${folderIds.length} distinct folder(s) · ` +
      `${known.size} already stored, ${folderIds.length - known.size} to fetch`,
  );

  let linked = 0;
  let fetched = 0;
  let unresolved = 0;
  const notDrive: number[] = [];

  for (const [index, order] of orders.entries()) {
    const ref = parseDriveUrl(order.imageUrl);
    // A free-form column: not every value in it is a Drive link. Report those
    // rather than inventing a mockup for them.
    if (!ref) {
      notDrive.push(order.id);
      continue;
    }

    const isNew = !known.has(ref.id);

    if (dryRun) {
      // Never resolveFolderMockup here — that UPSERTS, and a dry run that
      // writes 426 rows is not a dry run. readFolder is exported for exactly
      // this: the same read, without the memo.
      if (isNew) {
        known.add(ref.id);
        const label = `   #${order.id} ${order.externalId ?? ""}`;
        // A direct file link needs no listing, so it costs no request and no
        // pause — the same shortcut resolveFolderMockup takes.
        if (ref.kind === "file") {
          console.log(`${label} → direct file ${ref.id}`);
        } else {
          const file = await readFolder(ref.id).catch(() => null);
          fetched++;
          await pause();
          if (file) console.log(`${label} → ${file.name} (${file.id})`);
          else {
            unresolved++;
            console.log(`${label} → UNREADABLE folder ${ref.id}`);
          }
        }
      }
      linked++;
    } else {
      const mockup = await resolveFolderMockup(order.imageUrl);
      if (isNew) {
        known.add(ref.id);
        // Both counters are per FOLDER, not per order — 489 orders over 426
        // folders would otherwise report numbers nobody can compare with the
        // dry run's. A direct file link costs no request, so it is neither
        // counted nor paused for.
        if (ref.kind !== "file") {
          fetched++;
          if (!mockup?.thumbnail) unresolved++;
          await pause();
        }
      }
      if (!mockup) {
        notDrive.push(order.id);
        continue;
      }
      await prisma.order.update({ where: { id: order.id }, data: { mockupId: mockup.id } });
      linked++;
    }

    if ((index + 1) % LOG_EVERY === 0) {
      console.log(
        `   … ${index + 1}/${orders.length} orders · ${fetched} folder(s) fetched · ${unresolved} unresolved`,
      );
    }
  }

  return { orders: orders.length, linked, fetched, unresolved, notDrive };
}

async function main() {
  if (dryRun) console.log("DRY RUN — reporting only, nothing is written.\n");

  // Retry first: it clears remembered failures, so an order still waiting on
  // one of those folders gets linked to a mockup that now has a thumbnail
  // rather than to the memo of a failure.
  if (retryUnresolved) await retryUnresolvedMockups();

  const result = await linkOrders();

  console.log(`${"=".repeat(64)}`);
  console.log(`${dryRun ? "would link" : "linked"}   : ${result.linked}/${result.orders} orders`);
  console.log(`fetched   : ${result.fetched} folder(s) from Drive`);
  console.log(`unresolved: ${result.unresolved} folder(s) we cannot read (placeholder stays)`);
  if (result.notDrive.length) {
    console.log(
      `not a drive link: ${result.notDrive.length} order(s) — ` +
        `${result.notDrive.slice(0, 10).join(", ")}${result.notDrive.length > 10 ? ", …" : ""}`,
    );
  }

  const [withImage, stillUnlinked, mockups, resolved] = await Promise.all([
    prisma.order.count({ where: { deletedAt: null, imageUrl: { not: null } } }),
    prisma.order.count({ where: { deletedAt: null, imageUrl: { not: null }, mockupId: null } }),
    prisma.mockup.count(),
    prisma.mockup.count({ where: { thumbnail: { not: null } } }),
  ]);
  console.log(
    `\ntotals    : ${withImage} orders with a design link · ${stillUnlinked} still unlinked · ` +
      `${mockups} mockups (${resolved} with a thumbnail)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
