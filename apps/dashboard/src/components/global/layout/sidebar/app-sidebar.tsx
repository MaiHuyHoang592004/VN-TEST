/**
 * The full navigation tree, rendered as a SHEET and nothing else — and, since
 * the top nav took over the desktop, as the MOBILE nav and nothing else.
 *
 * The DS is unambiguous: "GWP never uses a dark or vertical sidebar." Task 16
 * removed the persistent 240px rail from the root layout, so this component no
 * longer has a desktop mode: `collapsible="offcanvas"` plus the provider's
 * `defaultOpen={false}` (set in Navbar) keep the desktop branch off-canvas, and
 * SidebarNavButtons opens the sheet. The rail-only affordances — hover-to-open,
 * the pin button and the drag-to-resize SidebarRail with its localStorage width
 * — went with the rail.
 *
 * It still renders every route, because a phone has room for four dock icons
 * and this is where the rest live. On desktop the same routes are on the bar:
 * four inline, Analytics and Wallet under Tools ▾, the seventeen staff routes
 * under Workspace ▾, and the account rows under the avatar. All of them read
 * config/nav-tabs.ts + config/nav-icons.ts, so no list here is a second copy.
 */

"use client";

import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Home,
  Package,
  Boxes,
  Wallet,
  BarChart3,
  Settings,
  User,
  CreditCard,
  HelpCircle,
  LifeBuoy,
  LogOut,
} from "lucide-react";

import { useAuth } from "@/components/global/providers";
import { useTranslation } from "@/lib/i18n";
import { activeHref } from "@/config/nav-tabs";
import { sectionNav } from "@/config/nav-icons";
import { usePermissions } from "@/hooks/use-permissions";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { Search } from "@/components/global/search";
import { TeamSwitcher } from "@/components/global/layout/navbar/menus/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MAIN_NAV = [
  { key: "nav.home", href: "/", icon: Home },
  { key: "nav.orders", href: "/orders", icon: Package },
  { key: "catalog.browse.title", href: "/catalog", icon: Boxes },
  { key: "nav.wallet", href: "/wallet", icon: Wallet },
  { key: "nav.tickets", href: "/tickets", icon: LifeBuoy },
  { key: "nav.analytics", href: "/analytics", icon: BarChart3 },
];

const ACCOUNT_NAV = [
  { key: "nav.profile", href: "/profile", icon: User },
  { key: "nav.settings", href: "/settings", icon: Settings },
  { key: "nav.billing", href: "/profile/billing", icon: CreditCard },
  { key: "nav.helpSupport", href: "/help", icon: HelpCircle },
];

/**
 * The way into the sheet — the phone's whole navigation.
 *
 * The history matters, because this button's breakpoint has been wrong twice.
 * It was lg:hidden while the desktop had a persistent rail; Task 16 removed the
 * rail and the hide left every viewport from 1024px up with no navigation at
 * all, so the hide came off. The top nav now carries every route on desktop —
 * four inline, Tools ▾, Workspace ▾, the avatar menu — which is the condition
 * that was missing then, so the caller in Navbar hides it below md again. The
 * rule is the same one it always was: this button is absent only where the
 * navigation is somewhere else.
 */
export function SidebarNavButtons() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { setOpenMobile } = useSidebar();

  if (!user) return null;

  return (
    // shrink-0 keeps it square: it shares a flex row with the mark and the nav
    // items, and without it flexbox takes the row's overflow out of this
    // button's width while size-9 holds the height — a 36px-tall button
    // squeezed to ~29px wide, which is the oval.
    //
    // The breakpoint lives on the CALLER, not here: Navbar wraps this in
    // md:hidden. A component that hides itself cannot be reused at a width
    // where the surrounding nav is different, and that is exactly the mistake
    // this button has already made twice.
    <button
      aria-label={t("sidebar.open")}
      onClick={() => setOpenMobile(true)}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-(--radius-pill) text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
    >
      <Menu className="size-4" />
    </button>
  );
}

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const { can } = usePermissions();
  const adminNav = sectionNav("/admin").filter((item) => !item.permission || can(item.permission));
  const showFulfillment = can("orders.status.update");
  const showInventory = can("inventory.read");
  if (!user) return null;

  const initial = (user.displayName || user.email || "?")[0].toUpperCase();

  // The sheet panel is already cream with the drawer shadow: --sidebar maps to
  // --surface-nav (globals.css) and SheetContent carries
  // shadow-(--shadow-drawer). Nothing to override on <Sidebar> itself.
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-3 p-3 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <TeamSwitcher />
          </div>
          {isMobile && (
            <button
              aria-label={t("sidebar.close")}
              title={t("sidebar.close")}
              onClick={() => setOpenMobile(false)}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-pill) text-navy-500 transition-colors duration-(--dur-fast) hover:bg-sky-100 hover:text-navy-700 focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* pb-1 opens a breath between the search box and the nav list. */}
        <div className="pb-1">
          <Search variant="dropdown" fullWidth anchor="left" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {MAIN_NAV.map(({ key, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={href === activeHref(pathname, MAIN_NAV.map((i) => i.href))}
                    tooltip={t(key)}
                    render={<Link href={href} onClick={() => setOpenMobile(false)} />}
                    className="rounded-(--radius-pill) font-sans text-(length:--fs-body) font-semibold text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 data-active:bg-sky-200 data-active:text-navy-700"
                  >
                    <Icon className="size-4" />
                    <span>{t(key)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Section dividers, inside the conditional so no stray rule is left
            behind when the viewer has no admin permissions. */}
        {showFulfillment && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className="font-sans text-(length:--fs-micro) font-semibold uppercase tracking-(--ls-label) text-(--text-label)">{t("fulfillment.nav.section")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {sectionNav("/fulfillment").map(({ key, href, icon: Icon }) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        isActive={href === activeHref(pathname, sectionNav("/fulfillment").map((i) => i.href))}
                        tooltip={t(key)}
                        render={<Link href={href} onClick={() => setOpenMobile(false)} />}
                        className="rounded-(--radius-pill) font-sans text-(length:--fs-body) font-semibold text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 data-active:bg-sky-200 data-active:text-navy-700"
                      >
                        <Icon className="size-4" />
                        <span>{t(key)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {showInventory && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className="font-sans text-(length:--fs-micro) font-semibold uppercase tracking-(--ls-label) text-(--text-label)">{t("inventory.nav.section")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {sectionNav("/inventory").map(({ key, href, icon: Icon }) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        isActive={href === activeHref(pathname, sectionNav("/inventory").map((i) => i.href))}
                        tooltip={t(key)}
                        render={<Link href={href} onClick={() => setOpenMobile(false)} />}
                        className="rounded-(--radius-pill) font-sans text-(length:--fs-body) font-semibold text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 data-active:bg-sky-200 data-active:text-navy-700"
                      >
                        <Icon className="size-4" />
                        <span>{t(key)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {adminNav.length > 0 && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className="font-sans text-(length:--fs-micro) font-semibold uppercase tracking-(--ls-label) text-(--text-label)">{t("admin.title")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminNav.map(({ key, href, icon: Icon }) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        isActive={href === activeHref(pathname, adminNav.map((i) => i.href))}
                        tooltip={t(key)}
                        render={<Link href={href} onClick={() => setOpenMobile(false)} />}
                        className="rounded-(--radius-pill) font-sans text-(length:--fs-body) font-semibold text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 data-active:bg-sky-200 data-active:text-navy-700"
                      >
                        <Icon className="size-4" />
                        <span>{t(key)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel className="font-sans text-(length:--fs-micro) font-semibold uppercase tracking-(--ls-label) text-(--text-label)">{t("sidebar.account")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ACCOUNT_NAV.map(({ key, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={href === activeHref(pathname, ACCOUNT_NAV.map((i) => i.href))}
                    tooltip={t(key)}
                    render={<Link href={href} onClick={() => setOpenMobile(false)} />}
                    className="rounded-(--radius-pill) font-sans text-(length:--fs-body) font-semibold text-navy-600 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-sky-100 hover:text-navy-700 data-active:bg-sky-200 data-active:text-navy-700"
                  >
                    <Icon className="size-4" />
                    <span>{t(key)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-(--border-hairline) p-3 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <Avatar className="size-8 shrink-0">
            {user.photoURL ? <AvatarImage src={user.photoURL} /> : null}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          {/* Name only; the email shows on hover so the column stays one line */}
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="min-w-0 flex-1 truncate font-sans text-(length:--fs-body-sm) font-semibold text-navy-700 group-data-[collapsible=icon]:hidden" />
              }
            >
              {user.displayName || user.email}
            </TooltipTrigger>
            <TooltipContent side="top">{user.email}</TooltipContent>
          </Tooltip>
          <span className="flex shrink-0 items-center gap-0.5 group-data-[collapsible=icon]:hidden">
            {/* Theme toggle removed: dark mode is forced off (GWP ships no
                dark palette; see AppProviders' forcedTheme). */}
            <button
              aria-label={t("nav.logout")}
              onClick={() => void signOut()}
              className="inline-flex size-8 items-center justify-center rounded-(--radius-pill) text-navy-500 transition-colors duration-(--dur-fast) hover:bg-(--status-critical-bg) hover:text-(--status-critical-fg) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
            >
              <LogOut className="size-4" />
            </button>
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
