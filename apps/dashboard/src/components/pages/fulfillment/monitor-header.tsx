"use client";

import { PageHeader } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";

/**
 * The monitor board's hero.
 *
 * The two workstations keep the display heading Task 18 gave them — they sit
 * on the admin chrome and a hero there would push the scan field, which is the
 * only thing a packer looks at, off the first screen. The board is read rather
 * than worked, so it takes the hero.
 */
export function MonitorHeader() {
  const { t } = useTranslation();

  return (
    <PageHeader
      meta={t("fulfillment.nav.section")}
      title={t("fulfillment.monitor.title")}
      subtitle={t("fulfillment.monitor.subtitle")}
      tone="soft"
      size="sm"
    />
  );
}
