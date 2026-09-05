/**
 * The GWP TopNav: a warm cream shell FLOATING on the sky canvas, with sky
 * visible around a rounded pill and one quiet shadow. The DS rules out the
 * three things this bar used to be — full bleed, translucent, backdrop-blurred.
 *
 * Passive items are navy, the active item is a pale sky pill, and Action Blue
 * appears exactly ONCE in the whole nav (the signup CTA).
 *
 * Also carries the mobile dock and the sheet's SidebarProvider.
 */

"use client";

import { usePathname } from "next/navigation";
import { Home, User, Package, Boxes, ScanLine } from "lucide-react";
import { Search } from "@/components/global/search";
import { Button } from "@/components/ui/button";
import { GwpMark } from "@/components/ds";
import { useAuth } from "@/components/global/providers";
import { usePermissions } from "@/hooks/use-permissions";
import { activeHref } from "@/config/nav-tabs";
import { useTranslation } from "@/lib/i18n";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { NotificationBell } from "../notifications/notification-bell";
import {
  AppSidebar,
  SidebarNavButtons,
} from "@/components/global/layout/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MobileUserMenu } from "../menus/mobile-user-menu";
import { LanguageSelector } from "../menus/language-selector";
import { ToolsDropdown } from "../menus/tools-dropdown";
import { UserMenu } from "../menus/user-menu";
import { WorkspaceDropdown } from "../menus/workspace-dropdown";

/**
 * The phone's tab bar.
 *
 * FOUR ROUTES AT MOST, and that is the ceiling rather than a stage of growth.
 * iOS and Material both cap a bottom bar at five items; the avatar takes one.
 * The app is heading into a Capacitor shell where this bar IS the navigation,
 * and a seven-icon bar on a 375px screen is a column of targets a thumb misses.
 *
 * Three are fixed so the bar does not rearrange under someone who has learnt
 * where things are. The fourth appears only for staff who work a section all
 * day — a packer in Fulfillment, a customer hand in Inventory — because a
 * seller has neither and would get an icon that 403s.
 *
 * Everything else, admin included, stays one tap away behind the hamburger,
 * which opens the full sidebar as a sheet.
 */
function useDockTabs() {
  const { can } = usePermissions();

  const mine = can("orders.status.update")
    ? { href: "/fulfillment", icon: ScanLine, key: "fulfillment.nav.section" }
    : can("inventory.read")
      ? { href: "/inventory", icon: Boxes, key: "inventory.nav.section" }
      : null;

  return [
    { href: "/", icon: Home, key: "nav.home" },
    { href: "/orders", icon: Package, key: "nav.orders" },
    { href: "/catalog", icon: Boxes, key: "catalog.browse.title" },
    ...(mine ? [mine] : []),
  ];
}

/**
 * The DS's nav-item treatment: navy ink, a pale sky pill on hover, and the
 * sky-200 pill for aria-current="page". No underline — inside a pill-shaped
 * shell there is no bottom border for one to land on.
 */
const NAV_ITEM =
  "inline-flex h-9 items-center rounded-(--radius-pill) px-3 font-sans text-(length:--fs-body) font-semibold text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none aria-[current=page]:bg-sky-200 aria-[current=page]:text-navy-700";

/**
 * The primary nav, inline in the shell.
 *
 * FOUR ROUTES SIGNED IN, and the ceiling is the same argument as the mobile
 * dock's: everything past four is an overflow menu, not another item. Tools
 * carries Analytics and Wallet; Workspace carries the seventeen staff routes
 * and disappears entirely for a seller. That is the whole nav — a seller sees
 * Home · Orders · Products · Support · Tools and nothing greyed out.
 *
 * Signed out is the marketing bar and stays two items: Home is the page you
 * are already on, and Support needs an account.
 */
const SIGNED_IN_NAV = [
  { href: "/", key: "nav.home" },
  { href: "/orders", key: "nav.orders" },
  { href: "/catalog", key: "nav.products" },
  { href: "/tickets", key: "nav.tickets" },
];

const SIGNED_OUT_NAV = [
  { href: "/orders", key: "nav.orders" },
  { href: "/catalog", key: "nav.products" },
];

export function Navbar() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { t } = useTranslation();
  const dockTabs = useDockTabs();
  // Ask the LIST which one is active, never each item: /orders/print is under
  // /orders, and an item asked on its own answers about itself only.
  const activeTab = activeHref(pathname, dockTabs.map((d) => d.href));

  // The same rule for the desktop bar. Ask the LIST, not each item: "/" is the
  // only exact match, so a nested route keeps its parent lit and exactly one
  // item is ever current.
  const primaryNav = user ? SIGNED_IN_NAV : SIGNED_OUT_NAV;
  const activeNav = activeHref(pathname, primaryNav.map((i) => i.href));

  // The DS ships two chromes: the seller's cream shell floating on sky, and
  // the admin bar — white ground, full-bleed, one bright CTA. Admin screens
  // are dense tables where a floating shell wastes a row of vertical space, so
  // they take the bar. Derived from the route rather than added as a prop, so
  // no caller changes and no page can get it wrong.
  const isAdminChrome =
    pathname.startsWith("/admin") || pathname.startsWith("/fulfillment");

  return (
    // The root layout has no rail and no SidebarProvider any more (the DS:
    // "GWP never uses a dark or vertical sidebar"). SidebarNavButtons and
    // AppSidebar both call useSidebar(), so the provider moves here and wraps
    // only the nav subtree — the sheet keeps its context, the page does not
    // get a 240px column. `contents` because the provider's own wrapper is a
    // `flex min-h-svh` div, which would otherwise become a full-height flex
    // row between <body> and the nav. defaultOpen={false} so the desktop
    // branch of <Sidebar> stays off-canvas: the sheet is the only mode.
    <SidebarProvider defaultOpen={false} className="contents">
      <AppSidebar />
      <nav
        data-slot="top-nav"
        data-surface={isAdminChrome ? "white" : "cream"}
        className={
          isAdminChrome
            ? "sticky top-0 z-50 w-full border-b border-(--border-hairline) bg-(--surface-data)"
            : "sticky top-0 z-50 w-full px-4 pt-3 lg:px-8"
        }
        style={{ overflowAnchor: "none" }}
      >
        {/* On seller chrome the outer px/pt is what lets sky show AROUND the
            shell. Without it the nav is a full-bleed cream bar — the DS's
            explicitly non-canonical fallback. Everything INSIDE the container
            is identical in both chromes; the children are never forked. */}
        <div
          className={
            isAdminChrome
              ? "mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-6 lg:px-20"
              : "mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 rounded-(--radius-pill) bg-(--surface-nav) px-4 shadow-(--shadow-sm) lg:px-6"
          }
        >
          {/* Left — mark, primary nav, overflow menus. Identical shape signed
              in and signed out; only the item LIST differs, so the bar never
              rearranges itself around you. */}
          <div className="flex h-full min-w-0 items-center gap-3 lg:gap-6">
            {/* The sheet is the mobile nav now. Desktop reaches every route
                from this bar — Workspace ▾ carries the seventeen the sheet used
                to hold alone — so the hamburger goes back to md:hidden, where
                it was before the rail was removed. */}
            <span className="md:hidden">
              <SidebarNavButtons />
            </span>

            <Link
              href="/"
              aria-label="GWPrintz"
              className="flex shrink-0 items-center rounded-(--radius-pill) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none"
            >
              {/* One mark, one theme. The monogram already carries the
                  letterform, so there is no separate wordmark text node. */}
              <GwpMark size={26} tone="sky" />
            </Link>

            {/* Navigation Links (Desktop only) */}
            <div className="hidden min-w-0 items-center gap-1 md:flex">
              {primaryNav.map(({ href, key }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={activeNav === href ? "page" : undefined}
                  className={NAV_ITEM}
                >
                  {t(key)}
                </Link>
              ))}
              <ToolsDropdown />
              {/* Renders nothing for a seller — it has no group they can open. */}
              {user && <WorkspaceDropdown />}
            </div>
          </div>

          {/* Right - Search, Auth/User, Theme Toggle */}
          {/* shrink-0 for the same reason as the hamburger: the bell is a
              size-9 square and goes oval if flexbox takes the column's overflow
              out of its width. */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Search — signed-out only; the sidebar owns it once signed in */}
            {!user && (
              <div className="hidden lg:block">
                <Search variant="dropdown" />
              </div>
            )}

            {/* Auth Buttons or User Menu - Desktop only */}
            <div className="hidden items-center gap-2 md:flex">
              {loading ? (
                // Skeleton while loading auth state
                <div className="h-8 w-24 animate-pulse rounded-(--radius-pill) bg-sky-100" />
              ) : user ? null : (
                <>
                  {/* nativeButton={false} is required whenever Button renders a
                      non-button element in this Base UI build. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    render={<Link href="/" />}
                    nativeButton={false}
                  >
                    {t("nav.login")}
                  </Button>
                  {/* THE one Action Blue element in the entire nav. */}
                  <Button
                    variant="default"
                    size="sm"
                    render={<Link href="/?signup=1" />}
                    nativeButton={false}
                  >
                    {t("nav.signup")}
                  </Button>
                </>
              )}
            </div>

            {/* Dark mode is forced off (GWP ships no dark palette; see
                AppProviders' forcedTheme) — the toggle is removed here and
                from the sidebar footer, not just hidden. */}
            {user && <NotificationBell />}
            <LanguageSelector />
            {/* bell · language · avatar ▾ — the design's right-hand cluster.
                Desktop only: on mobile the dock's MobileUserMenu is the same
                menu in the shape a thumb reaches. */}
            {user && (
              <span className="hidden md:inline-flex">
                <UserMenu />
              </span>
            )}
          </div>
        </div>
      </nav>

      {/* No mobile search column, and no search tab in the dock. Every result
          navigates to /orders/<id> or /products/<id> (search.tsx resultHref)
          and NEITHER route exists, so the whole flow ended on the coming-soon
          page — and the index behind it is still the demo dataset. A tab that
          costs a fifth of the bar has to work. The sidebar keeps its search
          box for when the index is real; see doc 00 §5. */}

      {/* Mobile dock — floating pill, icons only, active state per route */}
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 md:hidden">
        {/* 44px targets and an 8px row gap: this is the primary navigation on
            a phone and is heading into a Capacitor shell, so it takes the
            platform floor rather than the 40px a desktop icon button can get
            away with. The size-5 icons are unchanged — the box grew, not the
            glyph. */}
        <div className="flex items-center gap-2 rounded-(--radius-pill) bg-(--surface-nav) p-1.5 shadow-(--shadow-md)">
          {dockTabs.map(({ href, icon: Icon, key }) => (
            <Link
              key={href}
              href={href}
              aria-label={t(key)}
              aria-current={activeTab === href ? "page" : undefined}
              className={`inline-flex size-11 items-center justify-center rounded-(--radius-pill) transition-colors duration-(--dur-fast) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none ${
                activeTab === href
                  ? "bg-sky-200 text-navy-700"
                  : "text-navy-500 hover:bg-sky-100 hover:text-navy-700"
              }`}
            >
              <Icon className="size-5" />
            </Link>
          ))}

          {user ? (
            <MobileUserMenu />
          ) : (
            <Link
              href="/"
              aria-label={t("nav.login")}
              className="inline-flex size-11 items-center justify-center rounded-(--radius-pill) text-navy-500 transition-colors duration-(--dur-fast) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
            >
              <User className="size-5" />
            </Link>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
}
