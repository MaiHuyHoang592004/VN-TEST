import { forTenant, systemPrisma } from "@orderlane/db";
import { contextForUser } from "@orderlane/services";
import { notFound } from "next/navigation";

/**
 * The seam where authentication will go.
 *
 * Right now it resolves "who is signed in" from an environment variable,
 * falling back to the first user with a membership in the tenant being viewed.
 * That is a development shim and it is deliberately ugly, so that nobody
 * mistakes it for a session.
 *
 * What matters is the shape: every page gets its Ctx from here, the membership
 * check happens once at this boundary, and the scoped client it returns is the
 * only way a page can reach the database. When auth lands, the body of
 * `currentContext` changes and no page does.
 */
export async function currentContext(tenantSlug: string) {
  const tenant = await systemPrisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, slug: true, currency: true },
  });
  if (!tenant) notFound();

  const email = process.env["DEV_USER_EMAIL"];
  const membership = await systemPrisma.membership.findFirst({
    where: { tenantId: tenant.id, ...(email ? { user: { email } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!membership) notFound();

  const ctx = await contextForUser(membership.userId, tenant.id);
  return { tenant, ctx };
}

export async function listTenants() {
  return systemPrisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: { slug: true, name: true, _count: { select: { orders: true } } },
  });
}

export { forTenant };
