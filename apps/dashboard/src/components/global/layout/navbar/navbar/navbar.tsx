/**
 * Unified Navbar Component
 * Clean navbar for all pages with search, auth buttons, and theme toggle
 * Includes mobile tab bar with geometric logo symbol
 */

"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";
import { Home, User, Package, Boxes, ScanLine } from "lucide-react";
import { Search } from "@/components/global/search";
import { useAuth } from "@/components/global/providers";
import { usePermissions } from "@/hooks/use-permissions";
import { activeHref } from "@/config/nav-tabs";
import { useTranslation } from "@/lib/i18n";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { NotificationBell } from "../notifications/notification-bell";
import { SidebarNavButtons } from "@/components/global/layout/sidebar/app-sidebar";
import { MobileUserMenu } from "../menus/mobile-user-menu";
import { LanguageSelector } from "../menus/language-selector";
import { ToolsDropdown } from "../menus/tools-dropdown";
import { NavTabs } from "./nav-tabs";

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

export function Navbar() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { t } = useTranslation();
  const dockTabs = useDockTabs();
  // Ask the LIST which one is active, never each item: /orders/print is under
  // /orders, and an item asked on its own answers about itself only.
  const activeTab = activeHref(pathname, dockTabs.map((d) => d.href));

  return (
    <>
      <nav
        className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 h-[60px] w-full border-b backdrop-blur"
        style={{ overflowAnchor: "none" }}
      >
        <div className="mx-auto flex h-full w-full items-center justify-between px-6 lg:px-20">
          {/* Left - Logo + Navigation Links シノビデータ */}
          <div className="flex h-full min-w-0 items-center gap-4 lg:gap-8">
            <SidebarNavButtons />
            {/* Section tabs live in this same column — no second bar. */}
            {user && <NavTabs />}
            {!user && (
              <>
            <Link
              href="/"
              className="flex items-center gap-2 text-xl font-semibold"
            >
              {/* Mobile symbol - before text */}
              <span className="lg:hidden">
                <Image
                  src="/Geomatric/black.svg"
                  alt="Logo"
                  width={24}
                  height={26}
                  className="block dark:hidden"
                  priority
                />
                <Image
                  src="/Geomatric/white.svg"
                  alt="Logo"
                  width={24}
                  height={26}
                  className="hidden dark:block"
                  priority
                />
              </span>
              OpCreative
            </Link>

            {/* Navigation Links (Desktop only) */}
            <div className="hidden items-center gap-6 md:flex">
              <Link
                href="/orders"
                className="text-muted-foreground hover:text-foreground after:bg-foreground relative text-sm font-medium transition-colors after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:transition-all after:duration-150 hover:after:w-full"
              >
                {t("nav.orders")}
              </Link>
              <Link
                href="/catalog"
                className="text-muted-foreground hover:text-foreground after:bg-foreground relative text-sm font-medium transition-colors after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:transition-all after:duration-150 hover:after:w-full"
              >
                {t("nav.products")}
              </Link>
              <ToolsDropdown />
            </div>
              </>
            )}
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
                <div className="bg-muted h-9 w-24 animate-pulse rounded-md" />
              ) : user ? null : (
                <>
                  <Link
                    href="/"
                    className="border-border hover:border-foreground/20 hover:bg-accent/50 inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors"
                  >
                    {t("nav.login")}
                  </Link>
                  <Link
                    href="/?signup=1"
                    className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors"
                  >
                    {t("nav.signup")}
                  </Link>
                </>
              )}
            </div>

            {/* Dark mode is forced off (GWP ships no dark palette; see
                AppProviders' forcedTheme) — the toggle is removed here and
                from the sidebar footer, not just hidden. */}
            {user && <NotificationBell />}
            <LanguageSelector />
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
        <div className="border-border bg-background/80 supports-[backdrop-filter]:bg-background/60 flex items-center gap-1 rounded-full border p-1.5 shadow-ds-4 backdrop-blur">
          {dockTabs.map(({ href, icon: Icon, key }) => (
            <Link
              key={href}
              href={href}
              aria-label={t(key)}
              aria-current={activeTab === href ? "page" : undefined}
              className={`inline-flex size-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeTab === href
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
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
              className="text-muted-foreground hover:bg-accent/60 hover:text-foreground inline-flex size-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <User className="size-5" />
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
