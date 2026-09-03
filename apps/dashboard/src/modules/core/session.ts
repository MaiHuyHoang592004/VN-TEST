/**
 * Typed session accessors for server code (server components, actions, route
 * handlers). Reads the Auth.js session cookie; the mobile/API transports will
 * resolve a SessionUser from a bearer token instead and call the same service
 * functions.
 */
import "server-only";

import { auth, type SessionUser } from "@opcreative/auth";

/** The current user, or null when signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    roles: session.user.roles ?? [],
    name: session.user.name,
    email: session.user.email,
  };
}
