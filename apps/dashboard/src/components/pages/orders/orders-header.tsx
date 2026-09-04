"use client";

import { PageHeader } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";

/**
 * The Orders hero.
 *
 * `tone="soft"` — pale sky, navy title — rather than the home page's saturated
 * cream-on-sky. Home is the app's brand moment and already spends that hero; a
 * list screen with a saturated one pushes the table below the fold.
 *
 * A client component because there is no server-side `t()` in this app: every
 * translated string comes from the `useTranslation` context, so a server page
 * cannot build its own title. The page stays a server component and renders
 * this.
 */
export function OrdersHeader() {
  const { t } = useTranslation();

  return (
    <PageHeader
      meta={t("nav.orders")}
      title={t("orders.title")}
      subtitle={t("orders.subtitle")}
      tone="soft"
    />
  );
}
