"use client";

import {
  Boxes,
  ChevronRight,
  CreditCard,
  Factory,
  LifeBuoy,
  PackageSearch,
  ShoppingBag,
} from "lucide-react";
import type { Permission } from "@gwprint/shared";

import { PageSection, SectionHeading, Surface } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { useTranslation } from "@/lib/i18n";


/**
 * A static support page — legitimately buildable with no backend.
 *
 * Everything here is either a description of this app or a link to a route
 * that exists. There is deliberately no phone number, email address, office
 * hours or response-time promise: none of those exist anywhere in this
 * codebase, and a support channel nobody is staffing is the most expensive
 * thing a help page can invent. The one contact route is a ticket, because
 * raising a ticket is what the platform actually supports.
 */
const AREAS: { key: string; href: string; icon: React.ReactNode; permission?: Permission }[] = [
  { key: "orders", href: "/orders", icon: <ShoppingBag /> },
  { key: "catalog", href: "/catalog", icon: <PackageSearch />, permission: "products.read" },
  { key: "inventory", href: "/inventory", icon: <Boxes />, permission: "inventory.read" },
  { key: "fulfillment", href: "/fulfillment", icon: <Factory />, permission: "orders.status.update" },
  { key: "billing", href: "/profile/billing", icon: <CreditCard /> },
  { key: "tickets", href: "/tickets", icon: <LifeBuoy /> },
];

export function HelpContent() {
  const { t } = useTranslation();
  const { can } = usePermissions();

  const areas = AREAS.filter((a) => !a.permission || can(a.permission));

  return (
    <>
      <PageSection>
        <div className="grid gap-4 lg:grid-cols-2">
          <Surface title={t("help.about.title")}>
            <p className="font-sans text-(length:--fs-body-sm) text-(--text-body)">
              {t("help.about.body")}
            </p>
          </Surface>

          <Surface title={t("help.contact.title")}>
            <p className="font-sans text-(length:--fs-body-sm) text-(--text-body)">
              {t("help.contact.body")}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {/* A link that looks like a button: Base UI must be told it is
                  not a native <button>, or it strips the semantics. */}
              <Button nativeButton={false} render={<Link href="/tickets" />}>
                <LifeBuoy data-icon="inline-start" />
                {t("help.contact.cta")}
              </Button>
              <span className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">
                {t("help.contact.note")}
              </span>
            </div>
          </Surface>
        </div>
      </PageSection>

      <PageSection>
        <SectionHeading title={t("help.guide.title")} subtitle={t("help.guide.subtitle")} />
        <Surface pad={false} radius="card" shadow="xs" className="overflow-hidden">
          <ul>
            {areas.map((area) => (
              <li key={area.key} className="border-b border-(--border-hairline) last:border-b-0">
                <Link
                  href={area.href}
                  // Hover DARKENS onto the palest sky rung, never a lighter tint.
                  className="flex items-center gap-4 px-5 py-4 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-(--surface-inset) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
                >
                  <span
                    aria-hidden="true"
                    className="shrink-0 [&_svg]:size-5 [&_svg]:stroke-(--text-label)"
                  >
                    {area.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans text-(length:--fs-body) font-semibold text-(--text-strong)">
                      {t(`help.areas.${area.key}.title`)}
                    </span>
                    <span className="block font-sans text-(length:--fs-body-sm) text-(--text-muted)">
                      {t(`help.areas.${area.key}.body`)}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 stroke-(--text-label) rtl:rotate-180"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      </PageSection>

      <PageSection>
        <Surface title={t("help.before.title")} subtitle={t("help.before.subtitle")}>
          <ol className="flex flex-col gap-3">
            {["s1", "s2", "s3"].map((step, index) => (
              <li key={step} className="flex items-baseline gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex size-6 shrink-0 items-center justify-center self-start rounded-full bg-(--wash-blue) font-mono text-(length:--fs-micro) font-semibold text-(--action-600)"
                >
                  {index + 1}
                </span>
                <span className="font-sans text-(length:--fs-body-sm) text-(--text-body)">
                  {t(`help.before.${step}`)}
                </span>
              </li>
            ))}
          </ol>
        </Surface>
      </PageSection>
    </>
  );
}
