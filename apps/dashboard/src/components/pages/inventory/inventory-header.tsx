"use client";

import { PageHeader, PageTabs } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";

/**
 * The hero for the three inventory routes.
 *
 * `tone="soft"` like every other operational list. It carries NO action: the
 * DS's operational hero owns no CTA by design, so each page's primary button
 * lives in its DataTableToolbar instead — the same surface, the slot the hero
 * deliberately does not provide.
 *
 * A client component because this app has no server-side `t()`.
 */
export function InventoryPageHeader({
  titleKey,
  subtitleKey,
}: {
  titleKey: string;
  subtitleKey: string;
}) {
  const { t } = useTranslation();

  return (
    <PageHeader
      meta={t("inventory.nav.section")}
      title={t(titleKey)}
      subtitle={t(subtitleKey)}
      tone="soft"
    >
      <PageTabs section="/inventory" />
    </PageHeader>
  );
}
