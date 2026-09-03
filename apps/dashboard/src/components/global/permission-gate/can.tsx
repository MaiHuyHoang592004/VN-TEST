"use client";

import type { ReactNode } from "react";
import type { Permission } from "@opcreative/shared";

import { usePermissions } from "@/hooks/use-permissions";

/**
 * Renders children only when the viewer holds the permission.
 *
 * THIS IS NOT SECURITY. It hides UI so people aren't shown buttons that would
 * fail — nothing more. A request can be sent without ever touching the UI,
 * which is why every server action begins with requirePermission and every page
 * re-checks on the server. If this component were the only check, the feature
 * would be wide open.
 */
export function Can({
  permission,
  role,
  fallback = null,
  children,
}: {
  permission?: Permission;
  /** For role-shaped cases that aren't a capability (a seller-only tab). */
  role?: string;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can, hasRole } = usePermissions();

  if (permission && !can(permission)) return <>{fallback}</>;
  if (role && !hasRole(role)) return <>{fallback}</>;
  return <>{children}</>;
}
