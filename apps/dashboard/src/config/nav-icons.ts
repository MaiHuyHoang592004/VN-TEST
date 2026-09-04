/**
 * Route → icon, and the section lists with icons attached.
 *
 * Lives beside `nav-tabs.ts` rather than inside it because that file is
 * imported by a plain node test, and pulling the icon library into it would
 * drag React components through that test. It lives OUTSIDE the sidebar for a
 * different reason: the sheet and the navbar's Workspace menu now render the
 * same three sections, and two hand-maintained icon maps of the same routes
 * have no mechanism to agree — the sidebar's own comment records exactly that
 * drift happening once already (/admin/materials in one list,
 * /inventory/receipts in the other).
 *
 * The ROUTES still come from `nav-tabs.ts`; this module only attaches glyphs.
 * A route with no icon here still renders, with the fallback.
 */
import {
  ArrowLeftRight,
  Boxes,
  CreditCard,
  Image as ImageIcon,
  Layers,
  ListTree,
  MonitorDot,
  PackageOpen,
  Receipt,
  ScanLine,
  ScrollText,
  Shapes,
  Truck,
  Users,
  Warehouse,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@gwprint/shared";

import { sectionTabs } from "@/config/nav-tabs";

export const NAV_ICONS: Record<string, LucideIcon> = {
  "/fulfillment": ScanLine,
  "/fulfillment/quick": Zap,
  "/fulfillment/monitor": MonitorDot,
  "/inventory": Boxes,
  "/inventory/receipts": PackageOpen,
  "/inventory/movements": ArrowLeftRight,
  "/admin/users": Users,
  "/admin/products": Boxes,
  "/admin/variants": Layers,
  "/admin/mockups": ImageIcon,
  "/admin/materials": Shapes,
  "/admin/boms": ListTree,
  "/admin/transactions": CreditCard,
  "/admin/vendors": Truck,
  "/admin/expenses": Receipt,
  "/admin/warehouses": Warehouse,
  "/admin/audit": ScrollText,
};

export type SectionNavItem = {
  /** i18n key, resolved with t(). */
  key: string;
  href: string;
  permission?: Permission;
  icon: LucideIcon;
};

/** One section's routes, with icons attached. */
export const sectionNav = (prefix: string): SectionNavItem[] =>
  sectionTabs(prefix).map((tab) => ({
    key: tab.labelKey,
    href: tab.href,
    permission: tab.permission,
    icon: NAV_ICONS[tab.href] ?? Boxes,
  }));

/**
 * The three groups the Workspace menu and the sheet both render, in the order
 * a staff member reads them: the floor first, then what the floor consumes,
 * then the books. Declared once so the two navs cannot disagree.
 */
export const WORKSPACE_SECTIONS = [
  { prefix: "/fulfillment", titleKey: "fulfillment.nav.section" },
  { prefix: "/inventory", titleKey: "inventory.nav.section" },
  { prefix: "/admin", titleKey: "admin.title" },
] as const;
