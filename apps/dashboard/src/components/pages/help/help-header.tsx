"use client";

import { PageHeader } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";


/**
 * `tone="sky"` and the wood rings, because this is one of the two places in
 * the app that is a BRAND moment rather than a data screen — the title is
 * cream on saturated sky, which is what "display ink follows the surface"
 * means. The header's own Craft Cut plus the rings is the DS's per-screen
 * maximum, so nothing below adds a third mark.
 */
export function HelpHeader() {
  const { t } = useTranslation();

  return (
    <PageHeader
      meta={t("help.meta")}
      title={t("help.title")}
      subtitle={t("help.subtitle")}
      tone="sky"
      rings
    />
  );
}
