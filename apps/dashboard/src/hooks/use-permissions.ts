"use client";

import { can, type Permission } from "@opcreative/shared";

import { useAuth } from "@/components/global/providers";

/**
 * The client half of the permission model. Same role→permission map the server
 * uses (imported from @opcreative/db), so the UI and the guard can never
 * disagree about what a role means.
 *
 * FOR HIDING UI ONLY. Hiding a button is a courtesy, not a security boundary —
 * a request can be sent without ever touching the UI, which is why every server
 * action starts with requirePermission.
 */
export function usePermissions() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];

  return {
    roles,
    can: (permission: Permission) => can(roles, permission),
    hasRole: (role: string) => roles.includes(role as (typeof roles)[number]),
  };
}
