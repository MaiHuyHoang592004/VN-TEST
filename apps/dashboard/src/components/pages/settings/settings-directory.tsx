"use client";

import {
  Bell,
  ChevronRight,
  CreditCard,
  KeyRound,
  Shield,
  ShieldCheck,
  UserRound,
  Webhook,
} from "lucide-react";
import type { Permission } from "@gwprint/shared";

import { PageSection, SectionHeading, Surface } from "@/components/ds";
import { usePermissions } from "@/hooks/use-permissions";
import { LocaleLink as Link } from "@/lib/i18n/navigation";
import { useTranslation } from "@/lib/i18n";


/**
 * Where the rest of the settings actually are.
 *
 * Every entry points at a route that EXISTS and at a screen that already
 * saves something. Nothing here is a placeholder for a page yet to be built —
 * a settings index that links to nowhere is the same lie as a toggle that
 * saves nothing.
 *
 * The permission filter is a courtesy only: each destination guards itself on
 * the server, as it must.
 */
const ENTRIES: { key: string; href: string; icon: React.ReactNode; permission?: Permission }[] = [
  { key: "profile", href: "/profile", icon: <UserRound /> },
  { key: "security", href: "/profile/security", icon: <Shield /> },
  { key: "billing", href: "/profile/billing", icon: <CreditCard /> },
  { key: "api", href: "/profile/api", icon: <KeyRound /> },
  { key: "webhooks", href: "/profile/webhooks", icon: <Webhook /> },
  { key: "notifications", href: "/notifications", icon: <Bell /> },
  { key: "admin", href: "/admin", icon: <ShieldCheck />, permission: "users.read" },
];

export function SettingsDirectory() {
  const { t } = useTranslation();
  const { can } = usePermissions();

  const entries = ENTRIES.filter((e) => !e.permission || can(e.permission));

  return (
    <PageSection>
      <SectionHeading
        title={t("settings.directory.title")}
        subtitle={t("settings.directory.subtitle")}
      />
      <Surface pad={false} radius="card" shadow="xs" className="overflow-hidden">
        <ul>
          {entries.map((entry) => (
            <li key={entry.key} className="border-b border-(--border-hairline) last:border-b-0">
              <Link
                href={entry.href}
                // No aria-label here: it REPLACED the row's own accessible
                // name, so the second line describing the section was never
                // announced. The row's content is its name; "open" is appended
                // below as sr-only text instead.
                // Hover DARKENS: the row sits on white, so the hover step is
                // the palest sky rung, never a lighter tint.
                className="flex items-center gap-4 px-5 py-4 transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-(--surface-inset) focus-visible:shadow-(--shadow-focus) focus-visible:outline-none motion-reduce:transition-none"
              >
                <span aria-hidden="true" className="shrink-0 [&_svg]:size-5 [&_svg]:stroke-(--text-label)">
                  {entry.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-(length:--fs-body) font-semibold text-(--text-strong)">
                    {t(`settings.links.${entry.key}.title`)}
                  </span>
                  <span className="block font-sans text-(length:--fs-body-sm) text-(--text-muted)">
                    {t(`settings.links.${entry.key}.body`)}
                  </span>
                </span>
                <span className="sr-only">{t("settings.open")}</span>
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
  );
}
