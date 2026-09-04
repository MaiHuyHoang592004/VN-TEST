"use client";

import { PageHeader } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";


/**
 * The operational hero. `tone="soft"` like every other operational screen, and
 * no action: PageHeader has no `action` prop by design, and this page's only
 * button is the Save inside the preferences card, where it belongs.
 */
export function SettingsHeader() {
  const { t } = useTranslation();

  return (
    <PageHeader
      meta={t("settings.meta")}
      title={t("settings.title")}
      subtitle={t("settings.subtitle")}
      tone="soft"
    />
  );
}
