"use client";

import { usePathname } from "next/navigation";

import { PageHeader } from "@/components/ds";
import { activeTabHref, sectionTabs } from "@/config/nav-tabs";
import { useTranslation } from "@/lib/i18n";

/**
 * The hero all five profile tabs share.
 *
 * Rendered once in the layout rather than five times: the title is read from
 * `nav-tabs.ts` — the same list the tab strip renders — so a tab and its header
 * can never disagree, and adding a sixth tab needs no change here.
 *
 * `tone="soft"` and no CTA: the DS's operational hero owns no action, so each
 * panel keeps its own submit button in its own footer.
 */
export function ProfilePageHeader() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const tabs = sectionTabs("/profile");
  const active = activeTabHref(pathname, tabs);
  const tab = tabs.find((x) => x.href === active);

  return (
    <PageHeader
      meta={t("profile.title")}
      title={tab ? t(tab.labelKey) : t("profile.title")}
      tone="soft"
      size="sm"
    />
  );
}
