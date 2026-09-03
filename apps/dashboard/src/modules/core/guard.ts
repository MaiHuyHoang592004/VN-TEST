/**
 * The authorization choke point. Deny by default: every server action and
 * every protected route handler starts with one of these calls. Rendering a
 * button only for admins is UX, not security — the request can be sent without
 * the UI (Next's own Server Actions guidance says exactly this), so the check
 * must live here, on the server, at the boundary.
 *
 * Never authorize on an id the client supplied without re-checking the actor
 * may act on it — requirePermission proves capability, the service proves
 * ownership.
 */
import "server-only";

import { forbidden, redirect } from "next/navigation";
import { can, type Permission, type SessionUser } from "@opcreative/auth";
import { getSessionUser } from "./session.ts";

/** Thrown when a signed-in user lacks a permission. Transports map it: server
 * actions surface it as an error, route handlers return 403. */
export class ForbiddenError extends Error {
  constructor(permission?: Permission) {
    super(permission ? `Missing permission: ${permission}` : "Forbidden");
    this.name = "ForbiddenError";
  }
}

/** No session at all. Kept for the token-authenticated API path, which must
 * answer 401 rather than redirect a browser. */
export class UnauthenticatedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Require a signed-in user, else send them to the login screen.
 *
 * Redirects rather than throws because Next renders a layout and its page in
 * PARALLEL: the (protected) layout's redirect wins the response, but a page
 * that threw here still logged an error on every signed-out visit — noise that
 * buries real failures. Redirecting makes both paths agree.
 *
 * In a server action this is also the right behaviour: an expired session
 * should land the user on login, not surface a raw error.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/");
  return user;
}

/**
 * Require a specific permission. Returns the actor so the caller can pass it
 * straight into a service function.
 *
 * A denial renders Next's 403 page (see app/forbidden.tsx) rather than
 * throwing: being told "no" is an expected outcome, and letting it escape as an
 * unhandled error means a 500 and a stack trace in the logs for what is really
 * routine. `forbidden()` throws its own control-flow signal, so nothing below
 * runs.
 *
 * ForbiddenError stays exported for the token-authenticated API path, which
 * must answer 403 JSON rather than render a page.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.roles, permission)) forbidden();
  return user;
}

/**
 * Require ANY of several permissions — for the scoped families, where the same
 * page serves every role and the SCOPE decides which rows they get.
 *
 * Reading orders is the case this exists for: `orders.read.own`,
 * `.customer` and `.all` are three grants for one capability, and guarding
 * the page on only the first locks out every customer and support user, who
 * hold one of the other two. The column filter still comes from scopes.ts, so
 * "may open the page" and "may see this column" stay separate questions.
 */
export async function requireAnyPermission(
  ...permissions: Permission[]
): Promise<SessionUser> {
  const user = await requireUser();
  if (!permissions.some((p) => can(user.roles, p))) forbidden();
  return user;
}
