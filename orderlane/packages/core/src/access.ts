/**
 * Capability tiers, not job titles.
 *
 * Three roles is a deliberate ceiling. A fourth would be somebody's
 * organisational chart leaking into a database type — "designer", "packer",
 * "proofreader" differ per merchant and change without a deploy, so they live
 * in a workflow transition's requiredRole, where they are configuration.
 */

export type Role = "OWNER" | "OPERATOR" | "VIEWER";

/** Ascending capability. A requirement is always a minimum, never an equality. */
export const ROLE_RANK: Readonly<Record<Role, number>> = Object.freeze({
  VIEWER: 0,
  OPERATOR: 1,
  OWNER: 2,
});

export const ROLES: readonly Role[] = Object.freeze(["VIEWER", "OPERATOR", "OWNER"]);

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && value in ROLE_RANK;
}

/** Does `role` meet a minimum of `required`? */
export function atLeast(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/**
 * Who is acting.
 *
 * Defined here rather than per package so there is exactly one Actor in the
 * system. A SYSTEM actor — a carrier webhook, a scheduled job — still carries
 * a role: automation that could quietly do what no human is allowed to do is
 * how a permission model gets hollowed out.
 */
export interface Actor {
  readonly kind: "USER" | "API_KEY" | "SYSTEM";
  readonly id?: string | undefined;
  readonly role: Role;
}
