/**
 * Per-section navbar tabs.
 *
 * Vercel's pattern: one persistent navbar (logo, notifications, language) with
 * a second column of tabs that changes per section. Declared as data in ONE place
 * rather than each page rendering its own column, so every section looks identical
 * and adding a section is a few lines here.
 *
 * Tabs are real ROUTES, not client-side state: deep links work, the back button
 * works, and each tab server-renders only its own data.
 *
 * `permission` hides a tab the user can't use. That is cosmetics — the page
 * itself still calls requirePermission, which is the actual security.
 */
import type { Permission } from "@gwprint/shared";

export type NavTab = {
  /** Absolute route. */
  href: string;
  /** i18n key, resolved with t(). */
  labelKey: string;
  /** Hide unless the viewer holds this permission. */
  permission?: Permission;
  /** Only these roles see the tab (for role-shaped, not permission-shaped,
   * cases like a seller-only billing tab). */
  roles?: readonly string[];
};

export type NavSection = {
  /** Longest matching prefix wins, so "/admin/users" beats "/admin". */
  prefix: string;
  /** Section name shown left of the tabs. */
  titleKey: string;
  tabs: NavTab[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    prefix: "/profile",
    titleKey: "profile.title",
    tabs: [
      { href: "/profile", labelKey: "profile.tabs.profile" },
      { href: "/profile/security", labelKey: "profile.tabs.security" },
      { href: "/profile/api", labelKey: "profile.tabs.api" },
      { href: "/profile/webhooks", labelKey: "profile.tabs.webhooks" },
      // Anyone who HAS a wallet: the permission, not the role name, is what
      // decides (the rule the rest of the app follows). Sellers and admins hold
      // transactions.read.own; customer and designer accounts do not, so the
      // tab stays hidden for the people it would only confuse.
      { href: "/profile/billing", labelKey: "profile.tabs.billing", permission: "transactions.read.own" },
    ],
  },
  {
    prefix: "/fulfillment",
    titleKey: "fulfillment.nav.section",
    // One permission for all three. The pages guard themselves; this is the
    // column of tabs a packer navigates the floor with.
    tabs: [
      { href: "/fulfillment", labelKey: "fulfillment.nav.station", permission: "orders.status.update" },
      { href: "/fulfillment/quick", labelKey: "fulfillment.nav.quick", permission: "orders.status.update" },
      { href: "/fulfillment/monitor", labelKey: "fulfillment.nav.monitor", permission: "orders.status.update" },
    ],
  },
  {
    prefix: "/inventory",
    titleKey: "inventory.nav.section",
    tabs: [
      { href: "/inventory", labelKey: "inventory.tabs.stock", permission: "inventory.read" },
      { href: "/inventory/receipts", labelKey: "inventory.tabs.receipts", permission: "inventory.read" },
      { href: "/inventory/movements", labelKey: "inventory.tabs.movements", permission: "inventory.read" },
    ],
  },
  {
    prefix: "/admin",
    titleKey: "admin.title",
    tabs: [
      { href: "/admin/users", labelKey: "admin.tabs.users", permission: "users.read" },
      { href: "/admin/products", labelKey: "catalog.products.title", permission: "products.manage" },
      { href: "/admin/variants", labelKey: "catalog.variants.title", permission: "products.manage" },
      { href: "/admin/mockups", labelKey: "catalog.mockups.title", permission: "mockups.manage" },
      // Master data, next to the other master data. It is gated on
      // inventory.read rather than an admin permission, so a customer admin
      // who maintains materials can reach them from here too.
      { href: "/admin/materials", labelKey: "inventory.nav.materials", permission: "inventory.read" },
      { href: "/admin/boms", labelKey: "inventory.nav.boms", permission: "inventory.read" },
      { href: "/admin/transactions", labelKey: "finance.title", permission: "transactions.read.all" },
      { href: "/admin/vendors", labelKey: "finance.vendors.title", permission: "vendors.manage" },
      { href: "/admin/expenses", labelKey: "finance.expenses.title", permission: "expenses.manage" },
      { href: "/admin/warehouses", labelKey: "admin.tabs.warehouses", permission: "warehouses.read" },
      { href: "/admin/audit", labelKey: "admin.tabs.audit", permission: "audit.read" },
    ],
  },
];

/**
 * Is `href` the route the user is currently under? Used by the sidebar and the
 * tab column so the two can never disagree about what "active" means.
 *
 * A nested route keeps its parent lit: /profile/security marks /profile active.
 * "/" is matched exactly — treating it as a prefix would light up Home on every
 * page in the app.
 */
export function isRouteActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The section owning a pathname, or null when it has no tabs. */
export function sectionFor(pathname: string): NavSection | null {
  let best: NavSection | null = null;
  for (const section of NAV_SECTIONS) {
    const matches =
      pathname === section.prefix || pathname.startsWith(`${section.prefix}/`);
    if (matches && (!best || section.prefix.length > best.prefix.length)) {
      best = section;
    }
  }
  return best;
}

/**
 * Which ONE of these routes is active. Longest match wins.
 *
 * This is the rule every nav must use, and isRouteActive alone is NOT it.
 * That function answers "is this route an ancestor of where I am?", which is
 * true of several items at once: on /inventory/receipts both /inventory and
 * /inventory/receipts say yes, and a nav that asks each item separately
 * highlights both. The sidebar did exactly that until it was pointed out —
 * Stock and Receipts lit together, and the pair only cleared when you left
 * the section entirely.
 *
 * Ask the LIST, not the item.
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    // isRouteActive still decides what "under" means, including "/" being
    // exact — otherwise Home is lit on every page in the app.
    if (!isRouteActive(pathname, href)) continue;
    if (!best || href.length > best.length) best = href;
  }
  return best;
}

/** The active tab of a section. */
export function activeTabHref(pathname: string, tabs: NavTab[]): string | null {
  return activeHref(
    pathname,
    tabs.map((t) => t.href),
  );
}

/**
 * The tabs of one section, for the SIDEBAR to render as a group.
 *
 * The sidebar used to keep its own copies of these lists, and they drifted
 * exactly as you would expect: /admin/materials shipped in the sidebar but not
 * the tab column, then /inventory/receipts shipped in the tab column but not the
 * sidebar. Two hand-maintained lists of the same routes have no mechanism to
 * agree, so there is now one list and the sidebar reads it.
 *
 * The sidebar still owns its ICONS — a tab column has none, and putting React
 * components in this file would drag the whole icon library into a config
 * module that a plain node test imports.
 */
export function sectionTabs(prefix: string): NavTab[] {
  return NAV_SECTIONS.find((s) => s.prefix === prefix)?.tabs ?? [];
}
