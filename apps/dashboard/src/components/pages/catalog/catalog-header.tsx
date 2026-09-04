"use client";

import { PageHeader } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";

/**
 * The catalogue hero, on CREAM.
 *
 * This is the one operational surface the DS hands to cream — it names product
 * wells among cream's sanctioned uses, and the catalogue is the brand-forward
 * screen a seller shops from rather than a dense operational table. Display ink
 * follows the surface, so the title is navy.
 */
export function CatalogHeader() {
  const { t } = useTranslation();

  return (
    <PageHeader
      meta={t("nav.products")}
      title={t("catalog.browse.title")}
      subtitle={t("catalog.browse.subtitle")}
      tone="cream"
    />
  );
}
