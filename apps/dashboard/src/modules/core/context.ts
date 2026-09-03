/**
 * Build an AuditContext (actor + request forensics) for a server action.
 * Route handlers build their own from the Request; this reads the ambient
 * headers Next exposes to server functions.
 */
import "server-only";

import { headers } from "next/headers";
import type { AuditContext } from "@opcreative/db";
import type { SessionUser } from "@opcreative/auth";

export async function auditContext(actor: SessionUser): Promise<AuditContext> {
  const h = await headers();
  return {
    actor,
    // x-forwarded-for is a list; the first entry is the client.
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}
