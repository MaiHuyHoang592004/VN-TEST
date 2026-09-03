/**
 * The authorization model, in one file.
 *
 * Code asks "can this user do X?" (a Permission), never "is this an admin?"
 * (a role). Roles map to permissions HERE and nowhere else, so adding a role
 * or moving a capability touches one table, not a hundred call sites.
 *
 * This module is deliberately pure — no DB, no session, no framework imports —
 * so it is trivially unit-testable and safe to import from any app (web today,
 * storefront and the mobile API later).
 *
 * It lives in @opcreative/shared — the isomorphic layer — because BOTH the
 * server (guards, column scoping) and the browser (hiding tabs and buttons) need
 * the same answers, and the two must never disagree. Putting it in the db
 * package would mean client components importing a package whose barrel pulls
 * in the Postgres driver; putting it in the app would leave the server unable
 * to reach it. Shared has zero dependencies, so it is safe anywhere.
 *
 * Dependency direction: shared ← db ← auth ← apps. Nothing here may import
 * from any of those.
 */

/**
 * The role vocabulary, defined HERE as the source of truth so this file stays
 * dependency-free. libs/db asserts at compile time that Prisma's generated
 * enum matches this list exactly, and a runtime test double-checks it — so the
 * schema and this file cannot drift apart silently.
 */
export const USER_ROLES = [
  "ADMIN",
  "SELLER",
  "WAREHOUSE",
  "WAREHOUSE_ADMIN",
  "SUPPORT",
  "DESIGNER",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/**
 * The minimal shape every transport resolves to before authorizing: the web
 * session's `user`, or the mobile access token's claims, or an API key's
 * owner. Guards produce this; services accept it as an explicit `actor` so
 * they never read cookies or headers themselves.
 */
export type SessionUser = {
  id: string;
  roles: UserRole[];
  name?: string | null;
  email?: string | null;
};

/**
 * Every capability in the system. The `.own` / `.customer` / `.all` suffix is
 * the SCOPE — read by scopes.ts to build the query filter — so "sellers see
 * only their own orders" is expressed once, in data, not re-implemented per
 * page. Add a permission here, grant it in ROLE_PERMISSIONS, use it in a guard.
 */
export const PERMISSIONS = [
  // Users / admin
  "users.read",
  "users.create",
  "users.update",
  "users.delete",
  "users.roles.manage", // separate from users.update on purpose (privilege escalation)
  "users.balance.manage",
  "users.impersonate", // reserved; not built in phase 2

  // Warehouses
  "warehouses.read",
  "warehouses.manage",
  "warehouses.members.manage",

  // Orders (scoped)
  "orders.read.own",
  "orders.read.customer",
  "orders.read.all",
  "orders.create",
  // Full field edit, and the only way to create an order for SOMEONE ELSE.
  "orders.update",
  // Move an order along the fulfillment map. Separate from orders.update so
  // the floor can advance work without being able to rewrite its money.
  "orders.status.update",
  "orders.delete",
  "orders.assign",
  "orders.refund",
  // Buy, link, download and print shipping labels. Separate from
  // orders.status.update because a label costs MONEY and moving an order does
  // not — the scan stations need only the latter. There is deliberately no
  // "orders.scan": scanning IS a status update, and a second permission for
  // the same act is one more thing to get out of sync.
  "orders.labels.manage",

  // Products
  "products.read",
  "products.manage",

  // Mockups — design assets, deliberately NOT covered by products.manage:
  // customer admins and support need to fix a bad mockup without gaining the
  // ability to edit the variant catalogue or its prices.
  "mockups.manage",

  // Transactions (scoped)
  "transactions.read.own",
  "transactions.read.all",
  "transactions.approve",

  // Tickets (scoped)
  "tickets.read.own",
  "tickets.read.all",
  "tickets.manage",

  // Inventory. Reading stock is wide (the floor and support both need it);
  // CHANGING a count is narrow, because every one of these permissions moves
  // real goods. The split mirrors who physically does the work: only an admin
  // orders stock, only the site that receives it books it in.
  "inventory.read",
  // Manual adjustments and quick imports — correcting the count by hand.
  "inventory.adjust",
  "inventory.receipts.create",
  "inventory.receipts.receive",

  // Master data. Deliberately NOT folded into inventory.adjust: adding a
  // material is not the same act as changing how many of it exist, and the
  // roles only happen to overlap today.
  "suppliers.manage",
  "boms.manage",
  "vendors.manage",
  // Money that is not a seller's: rent, ink, salaries, and the income that is
  // not an order. Admin-only, as the legacy module was — it is the company's
  // own books, not a warehouse's ledger.
  "expenses.manage",

  // Audit
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role → permissions. This is the whole policy. Read it top to bottom to know
 * exactly what each role can do; there is nowhere else to look.
 *
 * SELLER is the untrusted default: it can only ever touch its OWN data, which
 * is why every seller-reachable permission carries the `.own` scope.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [...PERMISSIONS], // everything, by construction

  WAREHOUSE_ADMIN: [
    "users.read",
    "warehouses.read",
    "warehouses.members.manage",
    "orders.read.customer",
    "orders.status.update",
    "orders.assign",
    "orders.labels.manage",
    "products.read",
    "mockups.manage",
    "tickets.read.all",
    "inventory.read",
    "inventory.adjust",
    "inventory.receipts.receive",
    "suppliers.manage",
    "boms.manage",
  ],

  WAREHOUSE: [
    "warehouses.read",
    "orders.read.customer",
    "orders.status.update",
    "orders.labels.manage",
    "products.read",
    "inventory.read",
    // Line staff book in what physically arrives, but cannot invent a count:
    // receiving is evidenced by a shipment, an adjustment is just a number.
    "inventory.receipts.receive",
  ],

  SUPPORT: [
    "users.read",
    "orders.read.all",
    "transactions.read.all",
    "products.read",
    // Answering "where is my order?" needs the stock picture, read-only.
    "inventory.read",
    "mockups.manage",
    "tickets.read.all",
    "tickets.manage",
  ],

  DESIGNER: [
    "orders.read.all",
    "products.read",
  ],

  SELLER: [
    "orders.read.own",
    "orders.create",
    "transactions.read.own",
    "tickets.read.own",
    "products.read",
  ],
};

/** All permissions a set of roles grants (union). */
export function permissionsFor(roles: readonly UserRole[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) out.add(p);
  }
  return out;
}

/** The one predicate the whole app is built on. */
export function can(roles: readonly UserRole[], permission: Permission): boolean {
  for (const role of roles) {
    if ((ROLE_PERMISSIONS[role] ?? []).includes(permission)) return true;
  }
  return false;
}

/**
 * The widest scope a user holds for a resource family, most-permissive first.
 * scopes.ts turns this into a Prisma `where`. Returns null when the user has
 * no read access to the family at all (→ query must return nothing).
 */
export type Scope = "all" | "customer" | "own";

export function scopeFor(
  roles: readonly UserRole[],
  family: "orders" | "transactions" | "tickets",
): Scope | null {
  if (can(roles, `${family}.read.all` as Permission)) return "all";
  if (family === "orders" && can(roles, "orders.read.customer")) return "customer";
  if (can(roles, `${family}.read.own` as Permission)) return "own";
  return null;
}
