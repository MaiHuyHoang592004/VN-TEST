/**
 * Admin user-management logic. Transport-agnostic (explicit `actor`, no cookie
 * reads) so the same functions back the web actions and the mobile API.
 *
 * The MONEY RULES live here and nowhere else:
 *   • balance is never written outside a $transaction that also writes the
 *     Transaction ledger column and the audit column — if they can disagree, the
 *     ledger is fiction;
 *   • amounts are Decimal end to end, never a JS float;
 *   • a reason is required and captured in the audit;
 *   • an idempotency key makes a double-submit credit exactly once, enforced by
 *     a UNIQUE constraint, not an app-level check that would race.
 */
import { createHash, randomBytes } from "node:crypto";

import {
  prisma,
  writeAudit,
  can,
  USER_ADMIN_SELECT,
  USER_PUBLIC_SELECT,
  Prisma,
  type AuditContext,
  type UserRole,
  type UserStatus,
} from "@opcreative/db";
import { notify } from "../../platform/index.ts";
import {
  applyBalanceMove,
  alreadyApplied,
  isDuplicateKey,
  NegativeBalanceError,
} from "../../core/ledger.ts";
import {
  adminUserUpdateSchema,
  inviteSchema,
  balanceMoveSchema,
} from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;

export type UserListQuery = {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  page?: number;
  pageSize?: number;
};

export async function listUsers(_actor: Actor, query: UserListQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.role ? { roles: { has: query.role } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_ADMIN_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export function getUser(_actor: Actor, id: string) {
  return prisma.user.findUniqueOrThrow({ where: { id }, select: USER_ADMIN_SELECT });
}

export async function updateUser(actor: Actor, id: string, raw: unknown, ctx: AuditContext) {
  const input = adminUserUpdateSchema.parse(raw);
  const before = await prisma.user.findUniqueOrThrow({
    where: { id },
    select: { name: true, phone: true, roles: true, status: true, tier: true, warehouseId: true, adminNote: true, sessionsValidFrom: true },
  });

  // Changing roles is a privilege-escalation vector, gated separately from the
  // general users.update permission.
  const rolesChanged = input.roles.slice().sort().join() !== before.roles.slice().sort().join();
  if (rolesChanged && !can(actor.roles, "users.roles.manage")) {
    return { ok: false as const, error: "cannot-manage-roles" as const };
  }

  const data: Prisma.UserUpdateInput = {
    name: input.name || null,
    phone: input.phone || null,
    roles: { set: input.roles },
    status: input.status,
    tier: input.tier ?? null,
    customer: input.warehouseId ? { connect: { id: input.warehouseId } } : { disconnect: true },
    adminNote: input.adminNote || null,
  };
  // Deactivating or banning revokes their sessions right away.
  if (input.status !== "ACTIVE" && before.status === "ACTIVE") {
    data.sessionsValidFrom = new Date();
  }
  /**
   * A role change propagates by itself: the JWT callback re-reads roles from
   * the database on a 60s revalidation, so a promotion lands within a minute
   * without anyone doing anything.
   *
   * Bumping sessionsValidFrom does something STRONGER than that — it makes the
   * callback return null, which SIGNS THE USER OUT. That is exactly right when
   * a role is taken AWAY (elevated access must stop now, not within a minute)
   * and wrong when one is granted: it used to log people out of a working
   * session as a reward for being promoted, with no explanation on screen.
   *
   * So: revoke on removal, let revalidation carry an addition.
   */
  const removedRoles = before.roles.filter((r) => !input.roles.includes(r));
  const addedRoles = input.roles.filter((r) => !before.roles.includes(r));
  if (removedRoles.length) data.sessionsValidFrom = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data });
    await writeAudit(tx, ctx, {
      action: rolesChanged ? "USER_ROLE_CHANGED" : "USER_UPDATED",
      targetType: "user",
      targetId: id,
      before,
      after: { ...input },
    });
    // Tell them their access changed. ROLE_CHANGED has had a panel column and
    // strings in all seven locales since doc 01 and nothing ever raised it —
    // so someone promoted to admin previously found out by noticing new menu
    // items, and someone demoted found out by hitting a 403.
    if (rolesChanged && id !== ctx.actor?.id) {
      await notify(tx, {
        userId: id,
        type: "ROLE_CHANGED",
        data: { roles: input.roles.join(", ") },
        href: "/profile",
      });
    }
  });
  return { ok: true as const, addedRoles, removedRoles };
}

export async function setUserStatus(actor: Actor, id: string, status: UserStatus, ctx: AuditContext) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id }, select: { status: true } });
  if (before.status === status) return { ok: true as const };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        status,
        // Any move off ACTIVE kills existing sessions immediately-ish.
        ...(status !== "ACTIVE" ? { sessionsValidFrom: new Date() } : {}),
      },
    });
    await writeAudit(tx, ctx, {
      action: "USER_STATUS_CHANGED",
      targetType: "user",
      targetId: id,
      before,
      after: { status },
    });
  });
  return { ok: true as const };
}

export async function deleteUser(actor: Actor, id: string, ctx: AuditContext) {
  if (id === actor.id) return { ok: false as const, error: "cannot-delete-self" as const };
  await prisma.$transaction(async (tx) => {
    // Soft delete + revoke sessions. A user with orders/transactions is never
    // hard-deleted.
    await tx.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: "INACTIVE", sessionsValidFrom: new Date() },
    });
    await writeAudit(tx, ctx, { action: "USER_DELETED", targetType: "user", targetId: id });
  });
  return { ok: true as const };
}

// ── Money ────────────────────────────────────────────────────────────────────

type MoneyKind = "TOPUP" | "REFUND" | "ADJUSTMENT";

/**
 * Admin money moves. The balance-and-ledger write itself lives in
 * core/ledger.ts — shared with order assignment and transaction approval, so
 * there is exactly one routine that can move a balance. What stays here is the
 * transaction boundary and the idempotency handling around it.
 */
async function moveBalance(
  actor: Actor,
  userId: string,
  kind: MoneyKind,
  signedAmount: Prisma.Decimal,
  input: { reason: string; paymentMethod?: string; idempotencyKey: string },
  ctx: AuditContext,
) {
  // Fast idempotency path: an identical prior move just returns success.
  if (await alreadyApplied(input.idempotencyKey)) return { ok: true as const, deduped: true };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const applied = await applyBalanceMove(tx, ctx, {
        userId,
        kind,
        amount: signedAmount,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        paymentMethod: input.paymentMethod ?? null,
      });
      // Tell the person whose money moved — in the SAME transaction, so a
      // rolled-back credit never announces itself. This lives here rather than
      // in core/ledger.ts because notifications are a domain concern and core
      // may not import a domain.
      if (kind !== "ADJUSTMENT") {
        await notify(tx, {
          userId,
          type: kind === "TOPUP" ? "BALANCE_TOPPED_UP" : "BALANCE_REFUNDED",
          data: { amount: signedAmount.toFixed(2), balance: applied.after.toFixed(2) },
          href: "/profile/billing",
        });
      }
      return applied;
    });
    return { ok: true as const, transactionId: result.transactionId };
  } catch (e) {
    if (e instanceof NegativeBalanceError) return { ok: false as const, error: "insufficient-balance" as const };
    // A racing duplicate lost the UNIQUE(idempotencyKey) — treat as deduped.
    if (isDuplicateKey(e)) return { ok: true as const, deduped: true };
    throw e;
  }
}

export async function topUpBalance(actor: Actor, userId: string, raw: unknown, ctx: AuditContext) {
  const input = balanceMoveSchema.parse(raw);
  return moveBalance(actor, userId, "TOPUP", new Prisma.Decimal(input.amount), input, ctx);
}

export async function refundBalance(actor: Actor, userId: string, raw: unknown, ctx: AuditContext) {
  const input = balanceMoveSchema.parse(raw);
  // A refund returns money to the seller — a positive balance change.
  return moveBalance(actor, userId, "REFUND", new Prisma.Decimal(input.amount), input, ctx);
}

export async function adjustBalance(
  actor: Actor,
  userId: string,
  direction: "credit" | "debit",
  raw: unknown,
  ctx: AuditContext,
) {
  const input = balanceMoveSchema.parse(raw);
  const magnitude = new Prisma.Decimal(input.amount);
  const signed = direction === "debit" ? magnitude.negated() : magnitude;
  return moveBalance(actor, userId, "ADJUSTMENT", signed, input, ctx);
}

// ── Invites ──────────────────────────────────────────────────────────────────

export async function listInvites(_actor: Actor) {
  return prisma.userInvite.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, email: true, roles: true, status: true, expiresAt: true,
      createdAt: true, invitedBy: { select: USER_PUBLIC_SELECT },
    },
  });
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const appUrl = () => process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function inviteUser(actor: Actor, raw: unknown, ctx: AuditContext) {
  const input = inviteSchema.parse(raw);

  // Granting roles via an invite is the same escalation risk as editing them.
  if (!can(actor.roles, "users.roles.manage") && input.roles.some((r) => r !== "SELLER")) {
    return { ok: false as const, error: "cannot-grant-roles" as const };
  }
  // An existing account is NOT a reason to refuse. Inviting someone who
  // already signed up is the normal way to bring them in — they accept, and
  // the new roles merge into what they have. Only a no-op is worth blocking.
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, roles: true },
  });
  if (existing && input.roles.every((r) => existing.roles.includes(r))) {
    return { ok: false as const, error: "already-has-roles" as const };
  }

  // Only the token hash is stored; the raw token lives only in the emailed link.
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  const invite = await prisma.$transaction(async (tx) => {
    // Supersede any prior pending invite to the same address.
    await tx.userInvite.updateMany({
      where: { email: input.email, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    const created = await tx.userInvite.create({
      data: {
        email: input.email,
        roles: input.roles,
        warehouseId: input.warehouseId ?? null,
        tier: input.tier ?? null,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedById: actor.id,
      },
      select: { id: true },
    });
    await writeAudit(tx, ctx, {
      action: "USER_INVITED",
      targetType: "invite",
      targetId: created.id,
      after: { email: input.email, roles: input.roles },
    });
    // Only someone who already has an account can be notified in-app; a
    // brand-new invitee has nowhere to see it, which is what the email is for.
    if (existing) {
      await notify(tx, {
        userId: existing.id,
        type: "INVITE_RECEIVED",
        data: { roles: input.roles.join(", "), from: actor.name ?? actor.email ?? "" },
        href: `/invite/${rawToken}`,
      });
    }
    return created;
  });

  // Lazy import: keeps the heavy NextAuth runtime out of the module graph for
  // the money/read paths (and out of `node --test`), which never send invites.
  const { sendInviteEmail } = await import("@opcreative/auth");
  await sendInviteEmail(input.email, `${appUrl()}/invite/${rawToken}`);
  return { ok: true as const, inviteId: invite.id };
}

/**
 * Look up an invite by the raw token from the emailed link. Unauthenticated —
 * the recipient hasn't signed in yet — so it returns only what the accept page
 * must show, never the whole column.
 */
export async function peekInvite(rawToken: string) {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const invite = await prisma.userInvite.findUnique({
    where: { tokenHash },
    select: {
      id: true, email: true, roles: true, status: true, expiresAt: true,
      invitedById: true,
    },
  });
  if (!invite) return { ok: false as const, error: "not-found" as const };
  if (invite.status !== "PENDING") return { ok: false as const, error: "already-used" as const };
  if (invite.expiresAt < new Date()) return { ok: false as const, error: "expired" as const };
  return { ok: true as const, invite };
}

/**
 * Apply an invite to the signed-in account.
 *
 * The signed-in email MUST match the invited address. Without that check,
 * anyone who got hold of a link could grant themselves whatever roles it
 * carries — the token proves someone was invited, not who is holding it.
 */
export async function acceptInvite(actor: Actor, rawToken: string, ctx: AuditContext) {
  const peek = await peekInvite(rawToken);
  if (!peek.ok) return peek;

  const me = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { email: true, roles: true },
  });
  if (me.email.toLowerCase() !== peek.invite.email.toLowerCase()) {
    return { ok: false as const, error: "wrong-account" as const };
  }

  const merged = [...new Set([...me.roles, ...peek.invite.roles])];
  const invitedById = peek.invite.invitedById;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      // Bumped so the new roles take effect on the next request rather than
      // after the revalidation window.
      data: { roles: { set: merged }, sessionsValidFrom: new Date() },
    });
    await tx.userInvite.update({
      where: { id: peek.invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await writeAudit(tx, ctx, {
      action: "USER_ROLE_CHANGED",
      targetType: "user",
      targetId: actor.id,
      before: { roles: me.roles },
      after: { roles: merged },
      reason: `Accepted invitation ${peek.invite.id}`,
    });
    // Close the loop for whoever sent it — otherwise an admin has to keep
    // checking the pending list to learn anything happened.
    if (invitedById) {
      await notify(tx, {
        userId: invitedById,
        type: "INVITE_ACCEPTED",
        data: { email: me.email },
        href: "/admin/users",
      });
    }
  });
  return { ok: true as const };
}

export async function revokeInvite(actor: Actor, inviteId: string, ctx: AuditContext) {
  const invite = await prisma.userInvite.findUnique({ where: { id: inviteId }, select: { status: true } });
  if (!invite || invite.status !== "PENDING") return { ok: false as const, error: "not-pending" as const };
  await prisma.$transaction(async (tx) => {
    await tx.userInvite.update({ where: { id: inviteId }, data: { status: "REVOKED" } });
    await writeAudit(tx, ctx, { action: "USER_INVITE_REVOKED", targetType: "invite", targetId: inviteId });
  });
  return { ok: true as const };
}
