"use client";

import { PageHeader } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";
import { money } from "@/lib/money";


/**
 * The wallet's brand moment: the balance, on saturated sky, in cream.
 *
 * Display ink follows the surface (DS rule 3) — on sky the title and the figure
 * are cream and the label is navy, never the other way round. The rings are the
 * screen's second mark and PageHeader's own Craft Cut is the first, which is the
 * per-screen maximum: nothing below this header may add a third.
 *
 * There are deliberately no buttons here. PageHeader has no `action` prop
 * because the operational hero owns no CTA; Request top-up / Request refund
 * live in the PageToolbar below (see wallet-actions.tsx).
 */
export function WalletHeader({ balance }: { balance: string }) {
  const { t } = useTranslation();

  return (
    <PageHeader
      meta={t("nav.tools.label")}
      title={t("nav.wallet")}
      subtitle={t("wallet.subtitle")}
      tone="sky"
      rings
    >
      <div>
        <p className="font-sans text-(length:--fs-micro) font-bold tracking-(--ls-caps) text-(--text-on-sky) uppercase">
          {t("wallet.available")}
        </p>
        {/* The one figure the whole screen exists for, so it takes the display
            face — a KPI number, which is what DS rule 4 rations it to. The
            string is the server's; this component never does money arithmetic. */}
        <p className="mt-2 font-display text-(length:--fs-display-lg) leading-(--lh-display) font-(--fw-display-heavy) tracking-(--ls-display-tight) text-(--display-on-sky)">
          {money(balance)}
        </p>
        <p className="mt-2 max-w-md font-sans text-(length:--fs-body) text-(--text-on-sky-secondary)">
          {t("wallet.chargeNote")}
        </p>
      </div>
    </PageHeader>
  );
}
