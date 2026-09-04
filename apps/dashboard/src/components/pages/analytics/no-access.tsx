"use client";

import { Info } from "lucide-react";

import { Callout } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";


/** A role that can read neither orders nor transactions still gets the page,
 * the window control and an honest sentence — not a blank screen. */
export function AnalyticsNoAccess() {
  const { t } = useTranslation();

  return (
    <Callout tone="info" icon={<Info />} title={t("analytics.noAccess.title")}>
      {t("analytics.noAccess.body")}
    </Callout>
  );
}
