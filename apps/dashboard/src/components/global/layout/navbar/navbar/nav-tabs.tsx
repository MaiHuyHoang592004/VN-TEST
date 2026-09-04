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
 * Active tab is the DS's pale SKY PILL. The underline that used to sit on the
 * navbar's bottom border went with the border: inside a floating pill-shaped
 * cream shell there is no bottom edge for one to land on.
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
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`relative inline-flex shrink-0 items-center rounded-(--radius-pill) px-3 font-sans text-(length:--fs-body-sm) font-semibold transition-colors duration-(--dur-fast) ease-(--ease-out) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none ${
              isActive
                ? "bg-sky-200 text-navy-700"
                : "text-navy-500 hover:bg-sky-100 hover:text-navy-700"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}
