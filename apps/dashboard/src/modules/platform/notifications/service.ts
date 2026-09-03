import {
  prisma,
  ROLE_PERMISSIONS,
  USER_ROLES,
  type Notification as NotificationRow,
  type NotificationType,
  type Permission,
  type Prisma,
  type AuditContext,
} from "@opcreative/db";

type Actor = NonNullable<AuditContext["actor"]>;

/** Shape the panel renders. Mirrors the demo contract it replaces, so the bell
 * needed no reshaping — only a real source. */
export type AppNotification = {
  id: string;
  type: NotificationType;
  values: Record<string, string>;
  href: string | null;
  read: boolean;
  createdAt: string;
};

/**
 * Record a notification for someone.
 *
 * Takes a transaction client when the caller has one, so the notification
 * commits with the thing it announces — no "you were invited" for an invite
 * that rolled back.
 *
 * Never stores rendered prose: the type plus `data` is looked up in the locale
 * files at display time, so a notification survives the reader changing
 * language.
 */
export async function notify(
  tx: Pick<typeof prisma, "notification">,
  input: {
    userId: string;
    type: NotificationType;
    data?: Prisma.InputJsonValue;
    href?: string;
  },
) {
  await tx.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      data: input.data,
      href: input.href ?? null,
    },
  });
}

function toAppNotification(n: NotificationRow): AppNotification {
  return {
    // BigInt doesn't survive the server→client boundary.
    id: String(n.id),
    type: n.type,
    values: (n.data as Record<string, string> | null) ?? {},
    href: n.href,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}

/** Newest first. Capped because the panel is a glance, not an archive. */
export async function listMine(actor: Actor, limit = 30): Promise<AppNotification[]> {
  const rows = await prisma.notification.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toAppNotification);
}

/**
 * One page of the archive — /notifications, where the panel's cap ends.
 *
 * The cursor is the last column's id, not a timestamp: autoincrement follows
 * insert order closely enough for a feed, and it is unique, where a timestamp
 * cursor silently drops rows that share its millisecond. `take: limit + 1` —
 * the extra column exists only to answer "is there another page".
 *
 * `types` is how the page's category tabs filter: the client translates its
 * category vocabulary into the types it maps to (notification-data owns that
 * mapping), and this layer only ever speaks types. Filtering the loaded slice
 * client-side instead would lie — a tab must show its whole history.
 */
export async function listMinePage(
  actor: Actor,
  opts: { cursor?: string; limit?: number; types?: NotificationType[] } = {},
): Promise<{ items: AppNotification[]; nextCursor: string | null }> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const rows = await prisma.notification.findMany({
    where: {
      userId: actor.id,
      ...(opts.types?.length ? { type: { in: opts.types } } : {}),
      ...(opts.cursor ? { id: { lt: BigInt(opts.cursor) } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map(toAppNotification),
    nextCursor: rows.length > limit ? String(page[page.length - 1].id) : null,
  };
}

export async function markRead(actor: Actor, id: string) {
  // Scoped to the actor: an id from the client must never reach someone
  // else's column.
  await prisma.notification.updateMany({
    where: { id: BigInt(id), userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true as const };
}

export async function markAllRead(actor: Actor) {
  await prisma.notification.updateMany({
    where: { userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true as const };
}

/**
 * Delete one of MY notifications — the archive page's swipe.
 *
 * A hard delete, deliberately: nothing in the schema references a
 * notification, and the event it announced is already recorded where it
 * matters (audit log, ledger, the order itself). Same actor scoping as
 * markRead — a foreign id deletes nothing, silently.
 */
export async function deleteOne(actor: Actor, id: string) {
  await prisma.notification.deleteMany({
    where: { id: BigInt(id), userId: actor.id },
  });
  return { ok: true as const };
}

/**
 * Fan one notification out to several people, in the caller's transaction.
 *
 * createMany rather than a loop: assigning a batch can reach a whole customer
 * rota, and one insert is one round trip. Duplicate ids are collapsed — a user
 * who is both the site's manager and a member should be told once.
 */
export async function notifyMany(
  tx: Pick<typeof prisma, "notification">,
  userIds: string[],
  input: { type: NotificationType; data?: Prisma.InputJsonValue; href?: string },
) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  await tx.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: input.type,
      data: input.data,
      href: input.href ?? null,
    })),
  });
}

/**
 * Everyone whose roles grant `permission` — the mechanism behind an
 * "admin-only" notification.
 *
 * Audience is derived from the SAME ROLE_PERMISSIONS table the guards read, so
 * a notification's reach and a page's access can never disagree. Hard-coding
 * `roles: ["ADMIN"]` here would mean granting a role a capability without it
 * receiving the alerts that capability implies.
 */
export async function usersWithPermission(permission: Permission): Promise<string[]> {
  const roles = USER_ROLES.filter((role) => ROLE_PERMISSIONS[role].includes(permission));
  if (!roles.length) return [];
  const rows = await prisma.user.findMany({
    where: { deletedAt: null, status: "ACTIVE", roles: { hasSome: roles } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** The staff rota of one site — who should hear that work landed there. */
export async function warehouseMemberIds(warehouseId: number): Promise<string[]> {
  const rows = await prisma.warehouseMember.findMany({
    where: { warehouseId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}
