"use client";

import { usePathname } from "next/navigation";

import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { useTranslation } from "@/lib/i18n";
import { usePermissions } from "@/hooks/use-permissions";
import { sectionFor, activeTabHref } from "@/config/nav-tabs";

/**
 * Section tabs, inline in the navbar's single column beside notifications and the
 * language picker — no second bar, so the chrome stays 60px tall on every page.
 *
 * Renders nothing on routes without tabs, so pages that don't need them lose
 * nothing to empty space.
 *
 * Active tab carries an underline sitting ON the navbar's bottom border
 * (Vercel's treatment) rather than a filled pill, which keeps navigation quiet
 * next to page content.
 */
export function NavTabs() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { can, hasRole } = usePermissions();

  const section = sectionFor(pathname);
  if (!section) return null;

  const tabs = section.tabs.filter((tab) => {
    if (tab.permission && !can(tab.permission)) return false;
    if (tab.roles && !tab.roles.some((r) => hasRole(r))) return false;
    return true;
  });
  if (tabs.length === 0) return null;

  const active = activeTabHref(pathname, tabs);

  return (
    // h-full + items-stretch so each tab fills the navbar's height and its
    // underline can land exactly on the bottom border.
    <div className="flex h-full min-w-0 items-stretch gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`relative inline-flex shrink-0 items-center rounded-sm px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(tab.labelKey)}
            {/* -bottom-px covers the navbar's own border line */}
            {isActive && (
              <span className="bg-foreground absolute inset-x-3 -bottom-px h-[2px] rounded-full" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
