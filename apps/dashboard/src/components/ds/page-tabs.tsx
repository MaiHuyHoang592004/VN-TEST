"use client";

import { usePathname } from "next/navigation";

import { activeTabHref, sectionTabs } from "@/config/nav-tabs";
import { usePermissions } from "@/hooks/use-permissions";
import { useTranslation } from "@/lib/i18n";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * A section's tabs, rendered INSIDE the page rather than in the navbar.
 *
 * They used to live in the nav shell as a second column. That worked while the
 * shell was a hamburger and nothing else, but the shell now carries the primary
 * nav (logo, four routes, two menus), and /admin's eleven tabs on the same
 * 56px row would scroll sideways inside a pill. The DS already puts a tab strip
 * in the hero — Orders' All / Processing / Needs attention sits there — so this
 * is the established slot, not a new one.
 *
 * The ROUTES still come from `config/nav-tabs.ts` and the active tab is still
 * `activeTabHref`, so this and the Workspace menu can never disagree about
 * where you are.
 *
 * Renders nothing below two tabs: one chip is not a choice, and a strip that
 * offers no alternative is furniture.
 */
export function PageTabs({
  section,
  className,
}: {
  /** Section prefix, e.g. "/admin". Must match a NAV_SECTIONS entry. */
  section: string;
  className?: string;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { can, hasRole } = usePermissions();

  const tabs = sectionTabs(section).filter((tab) => {
    if (tab.permission && !can(tab.permission)) return false;
    if (tab.roles && !tab.roles.some((r) => hasRole(r))) return false;
    return true;
  });
  if (tabs.length < 2) return null;

  const active = activeTabHref(pathname, tabs);

  return (
    <nav
      data-slot="page-tabs"
      aria-label={t("nav.sectionTabs")}
      className={cn(
        "flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-(--radius-pill) px-3.5 font-sans text-(length:--fs-body-sm) font-semibold transition-colors duration-(--dur-fast) ease-(--ease-out) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none",
              isActive
                // Selected is a FILL, never an underline. On the hero's pale sky
                // the fill that reads as lifted is the white data surface.
                ? "bg-(--surface-data) text-navy-700 shadow-(--shadow-xs)"
                // Hover DARKENS: the hero ground is sky-200, so the hover step
                // is sky-300, not a lighter tint.
                : "text-navy-600 hover:bg-sky-300 hover:text-navy-700"
            )}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
