"use client";

import { useState } from "react";

import { PageToolbar } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import {
  RefundRequestDialog,
  TopUpRequestDialog,
  type RefundableOrder,
} from "@/components/pages/profile/money-request-dialogs";


/**
 * The two things a seller can DO about the number they just read, in the slot
 * the DS puts a page's actions in — the toolbar under the hero, one Action Blue
 * button and one secondary.
 *
 * The dialogs are the profile module's, unchanged: /wallet and /profile/billing
 * ask for a top-up through exactly the same form and the same server action.
 */
export function WalletActions({ refundable }: { refundable: RefundableOrder[] }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState<"topup" | "refund" | null>(null);

  return (
    <>
      <PageToolbar>
        <p className="font-sans text-(length:--fs-body-sm) text-(--text-muted)">
          {t("wallet.actionsHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAsking("topup")}>
            {t("profile.billing.requestTopUp")}
          </Button>
          <Button variant="outline" onClick={() => setAsking("refund")}>
            {t("profile.billing.requestRefund")}
          </Button>
        </div>
      </PageToolbar>

      <TopUpRequestDialog
        open={asking === "topup"}
        onOpenChange={(o) => !o && setAsking(null)}
      />
      <RefundRequestDialog
        orders={refundable}
        open={asking === "refund"}
        onOpenChange={(o) => !o && setAsking(null)}
      />
    </>
  );
}
