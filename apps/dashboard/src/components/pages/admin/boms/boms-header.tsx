"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { LocaleLink } from "@/lib/i18n/navigation";
import { useTranslation } from "@/lib/i18n";

/**
 * Heading plus the Configs/Coverage switch.
 *
 * These two are a LENS on the same data rather than two areas, so they share
 * one route and switch on `?tab=` — deep-linkable either way. They are
 * deliberately NOT navbar tabs: the Administration column already carries eight
 * sections, and "BOMs" and "Coverage" sitting there as peers of Users and
 * Warehouses would say they are unrelated, which is the opposite of true.
 */
export function BomsHeader({ actions }: { actions?: ReactNode }) {
  const { t } = useTranslation();
  const params = useSearchParams();
  const tab = params.get("tab") === "coverage" ? "coverage" : "configs";

  const views = [
    { key: "configs", href: "/admin/boms", label: t("inventory.boms.tabs.configs") },
    { key: "coverage", href: "/admin/boms?tab=coverage", label: t("inventory.boms.tabs.coverage") },
  ] as const;

  return (
    // The title and subtitle are the route's PageHeader now; what is left here
    // is the view switcher and the page's actions.
    <header className="flex flex-col gap-4">
      {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}

      <nav className="border-border flex gap-1 border-b" aria-label={t("inventory.boms.title")}>
        {views.map((view) => (
          <LocaleLink
            key={view.key}
            href={view.href}
            aria-current={tab === view.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === view.key
                ? "border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {view.label}
          </LocaleLink>
        ))}
      </nav>
    </header>
  );
}
