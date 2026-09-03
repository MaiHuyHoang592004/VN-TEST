/**
 * Vercel-style app sidebar on the shadcn sidebar primitive.
 * Full-height, same surface color as the page. SidebarRail (right edge) is
 * the control: click toggles collapse, drag resizes (200-400px, persisted).
 * Collapsed = icon rail with tooltips; hovering expands it temporarily and
 * leaving collapses it again. Desktop only; mobile keeps the tab bar.
 * ponytail: teams are dummy data — wire to a real teams table later.
 */

"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Pin,
  PanelLeftClose,
  ChevronsUpDown,
  Check,
  Plus,
  Home,
  Package,
  Boxes,
  Layers,
  Image as ImageIcon,
  Wallet,
  BarChart3,
  Settings,
  User,
  CreditCard,
  HelpCircle,
  LifeBuoy,
  LogOut,
  Search as SearchIcon,
  Users,
  Warehouse,
  ScrollText,
  ScanLine,
  Zap,
  MonitorDot,
  ArrowLeftRight,
  Shapes,
  PackageOpen,
  ListTree,
  Truck,
  Receipt,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/components/global/providers";
import { useTranslation } from "@/lib/i18n";
import { activeHref, sectionTabs } from "@/config/nav-tabs";
import { usePermissions } from "@/hooks/use-permissions";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { Search } from "@/components/global/search";
import { ThemeToggle } from "@/components/global/theme";
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
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MIN_W = 200;
const MAX_W = 400;
/** Dragging narrower than this collapses the sidebar to the icon rail. */
const COLLAPSE_BELOW = 150;

// ponytail: dummy teams until the teams table exists
const TEAMS = [
  { id: "personal", name: "Niyam's projects", plan: "Hobby" },
  { id: "opcreative", name: "OpCreative", plan: "Pro" },
];

const MAIN_NAV = [
  { key: "nav.home", href: "/", icon: Home },
  { key: "nav.orders", href: "/orders", icon: Package },
  { key: "catalog.browse.title", href: "/catalog", icon: Boxes },
  { key: "nav.wallet", href: "/wallet", icon: Wallet },
  { key: "nav.tickets", href: "/tickets", icon: LifeBuoy },
  { key: "nav.analytics", href: "/analytics", icon: BarChart3 },
];

/**
 * Route → icon. The ONLY nav data the sidebar owns.
 *
 * The routes themselves come from config/nav-tabs.ts, so a page added to a
 * section appears in BOTH the tab column and this sidebar or in neither. The
 * sidebar used to keep parallel lists and they drifted exactly as you would
 * expect — /admin/suppliers landed in one, /inventory/receipts in the other.
 *
 * A route with no icon here still renders (with the fallback); the nav test
 * fails first, which is the point.
 */
const NAV_ICONS: Record<string, LucideIcon> = {
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
  "/admin/suppliers": Shapes,
  "/admin/boms": ListTree,
  "/admin/transactions": CreditCard,
  "/admin/vendors": Truck,
  "/admin/expenses": Receipt,
  "/admin/warehouses": Warehouse,
  "/admin/audit": ScrollText,
};

/** One section's routes, with icons attached. */
const sectionNav = (prefix: string) =>
  sectionTabs(prefix).map((tab) => ({
    key: tab.labelKey,
    href: tab.href,
    permission: tab.permission,
    icon: NAV_ICONS[tab.href] ?? Boxes,
  }));

const ACCOUNT_NAV = [
  { key: "nav.profile", href: "/profile", icon: User },
  { key: "nav.settings", href: "/settings", icon: Settings },
  { key: "nav.billing", href: "/profile/billing", icon: CreditCard },
  { key: "nav.helpSupport", href: "/help", icon: HelpCircle },
];

function TeamSwitcher() {
  const { t } = useTranslation();
  const [teamId, setTeamId] = useState(TEAMS[0].id);
  const team = TEAMS.find((x) => x.id === teamId) ?? TEAMS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="border-border hover:bg-accent/50 flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:p-1" />
        }
      >
        <span className="from-vercel-blue to-vercel-pink flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white">
          {team.name[0]}
        </span>
        <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <span className="block truncate text-sm font-medium">
            {team.name}
          </span>
        </span>
        <Badge
          product="secondary"
          className="shrink-0 group-data-[collapsible=icon]:hidden"
        >
          {team.plan}
        </Badge>
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0 group-data-[collapsible=icon]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 dark:bg-black" align="start">
        <DropdownMenuGroup>
          {TEAMS.map(({ id, name, plan }) => (
            <DropdownMenuItem key={id} onClick={() => setTeamId(id)}>
              <span className="from-vercel-blue to-vercel-pink mr-1 flex size-5 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-semibold text-white">
                {name[0]}
              </span>
              <span className="flex-1 truncate">{name}</span>
              <span className="text-muted-foreground text-xs">{plan}</span>
              {id === teamId && <Check className="stroke-vercel-blue size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Plus className="size-4" />
          <span>{t("sidebar.createTeam")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Navbar hamburger, mobile only — opens the sidebar as a sheet. */
export function SidebarNavButtons() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { setOpenMobile } = useSidebar();

  if (!user) return null;

  return (
    // shrink-0 keeps it square: it shares a flex column with NavTabs, whose tabs
    // are wider than a phone, and without this flexbox takes the overflow out
    // of this button's width while size-9 holds the height — a 36px-tall
    // button squeezed to ~29px wide, which is the oval. NavTabs scrolls
    // instead, which is what its overflow-x-auto is already there for.
    <button
      aria-label={t("sidebar.open")}
      onClick={() => setOpenMobile(true)}
      className="border-border hover:border-foreground/20 hover:bg-accent/50 inline-flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors md:hidden"
    >
      <Menu className="text-muted-foreground size-4" />
    </button>
  );
}

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const { open, setOpen, toggleSidebar, isMobile, setOpenMobile } =
    useSidebar();
  const pathname = usePathname();
  const { can } = usePermissions();
  const adminNav = sectionNav("/admin").filter((item) => !item.permission || can(item.permission));
  const showFulfillment = can("orders.status.update");
  const showInventory = can("inventory.read");
  // True while the sidebar is only open because the pointer is over it
  // (state, not a ref: the pin button's icon depends on it).
  const [hoverOpen, setHoverOpen] = useState(false);

  if (!user) return null;

  const initial = (user.displayName || user.email || "?")[0].toUpperCase();

  const onEnter = () => {
    if (!open) {
      setHoverOpen(true);
      setOpen(true);
    }
  };
  const onLeave = () => {
    if (hoverOpen) {
      setHoverOpen(false);
      setOpen(false);
    }
  };
  /** Pin: keep a hover-opened sidebar open. Unpin: collapse it. */
  const onPin = () => {
    if (hoverOpen) setHoverOpen(false);
    else setOpen(false);
  };
  /** Rail: drag to resize (writes --sidebar-width), click to toggle. */
  const onRailPointerDown = (e: React.PointerEvent) => {
    const startX = e.clientX;
    let dragged = false;
    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) < 4) return; // ignore click jitter
      dragged = true;
      setHoverOpen(false); // resizing pins it open
      if (ev.clientX < COLLAPSE_BELOW) {
        // dragged past the minimum → collapse to the icon rail
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setOpen(false);
        return;
      }
      if (!open) setOpen(true);
      const w = Math.min(MAX_W, Math.max(MIN_W, ev.clientX));
      document.documentElement.style.setProperty("--sidebar-width-user", `${w}px`);
      localStorage.setItem("sidebar:width", `${w}px`);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (dragged) return;
      // plain click: pin a hover-opened panel, otherwise toggle
      if (hoverOpen) setHoverOpen(false);
      else toggleSidebar();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <Sidebar collapsible="icon" onMouseEnter={onEnter} onMouseLeave={onLeave}>
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
              className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Search: real box when open; icon that pins open when collapsed.
            pb-1 opens a breath between the box and the nav list below. */}
        <div className="pb-1 group-data-[collapsible=icon]:hidden">
          <Search product="dropdown" fullWidth anchor="left" />
        </div>
        <button
          aria-label={t("nav.search")}
          onClick={() => {
            setHoverOpen(false);
            setOpen(true);
          }}
          className="text-muted-foreground hover:bg-accent hover:text-foreground hidden h-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:flex"
        >
          <SearchIcon className="size-4" />
        </button>
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
                    render={<Link href={href} />}
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
              <SidebarGroupLabel>{t("fulfillment.nav.section")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {sectionNav("/fulfillment").map(({ key, href, icon: Icon }) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        isActive={href === activeHref(pathname, sectionNav("/fulfillment").map((i) => i.href))}
                        tooltip={t(key)}
                        render={<Link href={href} />}
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
              <SidebarGroupLabel>{t("inventory.nav.section")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {sectionNav("/inventory").map(({ key, href, icon: Icon }) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        isActive={href === activeHref(pathname, sectionNav("/inventory").map((i) => i.href))}
                        tooltip={t(key)}
                        render={<Link href={href} />}
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
              <SidebarGroupLabel>{t("admin.title")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminNav.map(({ key, href, icon: Icon }) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        isActive={href === activeHref(pathname, adminNav.map((i) => i.href))}
                        tooltip={t(key)}
                        render={<Link href={href} />}
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
          <SidebarGroupLabel>{t("sidebar.account")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ACCOUNT_NAV.map(({ key, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={href === activeHref(pathname, ACCOUNT_NAV.map((i) => i.href))}
                    tooltip={t(key)}
                    render={<Link href={href} />}
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

      <SidebarFooter className="border-border border-t p-3 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <Avatar className="size-8 shrink-0">
            {user.photoURL ? <AvatarImage src={user.photoURL} /> : null}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          {/* Name only; the email shows on hover so the column stays one line */}
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="min-w-0 flex-1 truncate text-sm font-medium group-data-[collapsible=icon]:hidden" />
              }
            >
              {user.displayName || user.email}
            </TooltipTrigger>
            <TooltipContent side="top">{user.email}</TooltipContent>
          </Tooltip>
          <span className="flex shrink-0 items-center gap-0.5 group-data-[collapsible=icon]:hidden">
            <ThemeToggle />
            {!isMobile && (
              <button
                aria-label={t(hoverOpen ? "sidebar.pin" : "sidebar.collapse")}
                title={t(hoverOpen ? "sidebar.pin" : "sidebar.collapse")}
                onClick={onPin}
                className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {hoverOpen ? (
                  <Pin className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </button>
            )}
            <button
              aria-label={t("nav.logout")}
              onClick={() => void signOut()}
              className="text-muted-foreground hover:bg-accent hover:text-destructive inline-flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="size-4" />
            </button>
          </span>
        </div>
      </SidebarFooter>

      {/* Rail: click toggles collapse, drag resizes (shadcn SidebarRail) */}
      <SidebarRail onPointerDown={onRailPointerDown} />
    </Sidebar>
  );
}
