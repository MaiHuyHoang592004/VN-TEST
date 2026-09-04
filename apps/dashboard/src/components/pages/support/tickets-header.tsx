"use client";

import { PageHeader } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";

/**
 * The ticket list's hero. `tone="soft"` like every other operational list —
 * the cream-on-sky hero is home's alone.
 *
 * A client component because this app has no server-side `t()`; the route
 * stays a server component and renders this.
 */
export function TicketsHeader() {
  const { t } = useTranslation();

  return (
    <PageHeader
      meta={t("nav.helpSupport")}
      title={t("support.tickets.title")}
      subtitle={t("support.tickets.subtitle")}
      tone="soft"
    />
  );
}

/**
 * The detail hero: the subject is the title, the ticket id the eyebrow, in
 * mono because an id is a figure (DS rule 4).
 */
export function TicketDetailHeader({ id, title }: { id: number; title: string }) {
  return (
    <PageHeader
      meta={<span className="font-mono tracking-(--ls-mono) normal-case">#{id}</span>}
      title={title}
      tone="soft"
      size="sm"
    />
  );
}
