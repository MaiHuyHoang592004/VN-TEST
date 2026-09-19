import { atLeast, type Role } from "@orderlane/core/access";
import { PRESETS } from "@orderlane/core/workflow";
import { forTenant, systemPrisma } from "@orderlane/db";

import type { Actor, Ctx } from "../context.ts";
import { ForbiddenError, NotFoundError, isUniqueViolation, ConflictError } from "../errors.ts";
import { installDefinition } from "../workflow/definitions.ts";

/**
 * Creating a tenant is one of the few operations that legitimately crosses the
 * isolation boundary: there is no tenant to be scoped to until it exists. The
 * moment one does, this switches to a scoped client for everything else — the
 * pattern every cross-boundary operation in this codebase follows.
 */
export interface CreateTenantInput {
  readonly slug: string;
  readonly name: string;
  readonly currency?: string;
  readonly ownerUserId: string;
}

export interface CreatedTenant {
  readonly tenantId: string;
  readonly ctx: Ctx;
}

const LEDGER_ACCOUNTS = [
  "TENANT_WALLET",
  "TENANT_RECEIVABLE",
  "PLATFORM_REVENUE",
  "PLATFORM_CLEARING",
] as const;

export async function createTenant(input: CreateTenantInput): Promise<CreatedTenant> {
  const currency = (input.currency ?? "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ConflictError(`"${currency}" is not an ISO 4217 alpha-3 currency code`);
  }

  let tenantId: string;
  try {
    // The tenant row and its owner's membership are one unit: a tenant nobody
    // can administer is worse than no tenant.
    tenantId = await systemPrisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { slug: input.slug, name: input.name, currency },
      });
      await tx.membership.create({
        data: { tenantId: tenant.id, userId: input.ownerUserId, role: "OWNER" },
      });
      await tx.ledgerAccount.createMany({
        data: LEDGER_ACCOUNTS.map((kind) => ({ tenantId: tenant.id, kind, currency })),
      });
      return tenant.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`slug "${input.slug}" is taken`);
    throw error;
  }

  const ctx: Ctx = {
    tenantId,
    actor: { kind: "USER", id: input.ownerUserId, role: "OWNER" },
    db: forTenant(tenantId),
  };

  // Ship both example processes rather than one. A new tenant that can only
  // see the process we happened to write first would learn the wrong lesson
  // about what this product is.
  for (const preset of PRESETS) {
    await installDefinition(ctx, preset, { activate: preset.key === "standard-retail" });
  }

  return { tenantId, ctx };
}

/**
 * The one authorisation question the system asks, answered once per request.
 * Everything downstream trusts the Ctx it is handed.
 */
export async function resolveMembership(userId: string, tenantId: string): Promise<Role | null> {
  const membership = await systemPrisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/** Build a request context, or refuse. Returns 404-shaped errors for a tenant the user cannot see. */
export async function contextForUser(userId: string, tenantId: string): Promise<Ctx> {
  const role = await resolveMembership(userId, tenantId);
  // Not ForbiddenError: telling a stranger that a tenant exists is itself a
  // disclosure. Membership and existence are answered the same way.
  if (!role) throw new NotFoundError("tenant", tenantId);
  return { tenantId, actor: { kind: "USER", id: userId, role }, db: forTenant(tenantId) };
}

export function requireRole(ctx: Ctx, minimum: Role): void {
  if (!atLeast(ctx.actor.role, minimum)) {
    throw new ForbiddenError(`this action needs ${minimum}; the actor is ${ctx.actor.role}`, {
      required: minimum,
      actual: ctx.actor.role,
    });
  }
}

export async function listMembers(ctx: Ctx): Promise<{ userId: string; email: string; role: Role }[]> {
  const rows = await ctx.db.membership.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({ userId: m.userId, email: m.user.email, role: m.role }));
}

export async function setMemberRole(ctx: Ctx, userId: string, role: Role): Promise<void> {
  requireRole(ctx, "OWNER");

  // An owner removing their own last privilege locks everybody out of the
  // tenant, and there is no self-service route back.
  if (userId === ctx.actor.id && role !== "OWNER") {
    const owners = await ctx.db.membership.count({ where: { role: "OWNER" } });
    if (owners <= 1) {
      throw new ConflictError("a tenant must keep at least one owner");
    }
  }

  const updated = await ctx.db.membership.updateMany({ where: { userId }, data: { role } });
  if (updated.count === 0) throw new NotFoundError("membership", userId);
}

export type { Actor };
