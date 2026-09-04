"use client";

import { PageHeader } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";

/** The notification archive's hero. `tone="soft"` like every operational list. */
export function NotificationsHeader() {
  const { t } = useTranslation();

  return (
    <PageHeader
      meta={t("nav.home")}
      title={t("notifications.title")}
      tone="soft"
      size="sm"
    />
  );
}
