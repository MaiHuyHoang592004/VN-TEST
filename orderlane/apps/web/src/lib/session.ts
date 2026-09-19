import { systemPrisma } from "@orderlane/db";
import { NotFoundError, SESSION_COOKIE, contextForUser, resolveSession, type Ctx } from "@orderlane/services";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

/**
 * The authentication boundary.
 *
 * Everything below this line receives a `Ctx` and trusts it. The two questions
 * — "who is this?" and "are they a member of this tenant?" — are answered here,
 * once per request, and nowhere else.
 *
 * This file used to be a development shim that guessed at a user. Replacing it
 * with real sessions changed its body and nothing else: no page, service or
 * test needed editing, which was the point of putting the seam here.
 */

export interface Viewer {
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  readonly sessionId: string;
}

/** The signed-in person, or null. Never throws — callers decide what absence means. */
export async function currentViewer(): Promise<Viewer | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await resolveSession(token);
  if (!session) return null;
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    sessionId: session.sessionId,
  };
}

export async function requireViewer(returnTo?: string): Promise<Viewer> {
  const viewer = await currentViewer();
  if (!viewer) {
    redirect(returnTo ? `/signin?next=${encodeURIComponent(returnTo)}` : "/signin");
  }
  return viewer;
}

/**
 * A tenant-scoped context for the signed-in person.
 *
 * A tenant they are not a member of is `notFound`, not `forbidden`: telling a
 * stranger that a merchant exists here is itself a disclosure. `contextForUser`
 * makes the same choice, and this is the second place it matters.
 */
export async function currentContext(tenantSlug: string): Promise<{
  tenant: { id: string; name: string; slug: string; currency: string };
  viewer: Viewer;
  ctx: Ctx;
}> {
  const viewer = await requireViewer(`/t/${tenantSlug}/orders`);

  const tenant = await systemPrisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true, currency: true },
  });
  if (!tenant) notFound();

  try {
    const ctx = await contextForUser(viewer.userId, tenant.id);
    return { tenant, viewer, ctx };
  } catch (error) {
    // A service NotFoundError is a domain fact, not an HTTP status. Translating
    // it here is this layer's job — without the translation it surfaces as a
    // 500, which tells a visitor that something exists and broke rather than
    // that there is nothing here for them.
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

/** The merchants this person can actually open. */
export async function myTenants(userId: string) {
  const memberships = await systemPrisma.membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      tenant: { select: { slug: true, name: true, _count: { select: { orders: true } } } },
    },
  });
  return memberships.map((m) => ({ ...m.tenant, role: m.role }));
}

/** Request metadata recorded on a new session, for a person to recognise later. */
export async function sessionMeta() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ...(list.get("user-agent") ? { userAgent: list.get("user-agent")! } : {}),
    ...(forwarded ? { ip: forwarded } : {}),
  };
}
