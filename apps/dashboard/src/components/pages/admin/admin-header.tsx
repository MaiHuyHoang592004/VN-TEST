"use client";

import { usePathname } from "next/navigation";

import { PageHeader, PageTabs } from "@/components/ds";
import { activeTabHref, sectionTabs } from "@/config/nav-tabs";
import { useTranslation } from "@/lib/i18n";

/**
 * The hero every admin route shares.
 *
 * The title is READ FROM `nav-tabs.ts`, not passed in, for the same reason the
 * sidebar reads it: a route added to the section gets a header and a tab or
 * neither, and the two can never disagree about what a screen is called. That
 * is nav data, not new logic — `activeTabHref` is the same helper NavTabs asks.
 *
 * `tone="soft"` and no CTA: the DS's operational hero owns no action, so each
 * page's primary button stays in its DataTableToolbar.
 *
 * A client component because this app has no server-side `t()`.
 */
export function AdminPageHeader({ subtitleKey }: { subtitleKey?: string }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const tabs = sectionTabs("/admin");
  const active = activeTabHref(pathname, tabs);
  const tab = tabs.find((x) => x.href === active);

  return (
    <PageHeader
      meta={t("admin.title")}
      title={tab ? t(tab.labelKey) : t("admin.title")}
      subtitle={subtitleKey ? t(subtitleKey) : undefined}
      tone="soft"
      size="sm"
    >
      <PageTabs section="/admin" />
    </PageHeader>
  );
}
