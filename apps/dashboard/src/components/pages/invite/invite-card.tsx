"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KeyValueRow } from "@/components/ds";
import { useTranslation } from "@/lib/i18n";

import { AcceptInvite } from "./accept-invite";

/**
 * The body of the invitation card — everything on it that is words.
 *
 * It exists because the page is a server component and this app has no
 * server-side `t()`: every translated string comes from the useTranslation
 * context. The page kept its copy inline and so shipped the one screen a new
 * user meets FIRST in English only, in an app with seven locales.
 *
 * Expiry is shown because the invite genuinely carries `expiresAt` and a
 * recipient deciding whether to act now is the person it matters to. There is
 * deliberately NO "Decline": no action exists to decline an invitation, and a
 * button that records nothing is worse than its absence — ignoring the mail is
 * already the way to decline, and the link expires on its own.
 */
export function InviteCard({
  token,
  email,
  roles,
  expiresAt,
  signedInAs,
}: {
  token: string;
  email: string;
  roles: string[];
  /** ISO string — Date does not survive the server/client boundary intact. */
  expiresAt: string;
  signedInAs: string | null;
}) {
  const { t } = useTranslation();

  return (
    <>
      <div>
        <h1 className="font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong)">
          {t("invite.title")}
        </h1>
        <p className="mt-1.5 text-(length:--fs-body-sm) text-(--text-muted)">
          {t("invite.subtitle")}
        </p>
      </div>

      {/* The three facts the design puts on this card, and all three are real
          columns on UserInvite — nothing here is decoration. */}
      <div className="flex flex-col">
        <KeyValueRow label={t("invite.email")} value={email} />
        <KeyValueRow
          label={t("invite.role")}
          value={
            <span className="flex flex-wrap justify-end gap-1.5">
              {roles.map((r) => (
                <Badge key={r} variant="secondary">
                  {t(`admin.roles.${r}`)}
                </Badge>
              ))}
            </span>
          }
        />
        <KeyValueRow
          label={t("invite.expires")}
          value={new Date(expiresAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        />
      </div>

      <AcceptInvite token={token} invitedEmail={email} signedInAs={signedInAs} />
    </>
  );
}

/**
 * The dead-end states: a link that is malformed, spent or out of date. Same
 * card, same shell — only the copy differs, and it too has to be translated.
 */
export function InviteUnavailable({
  reason,
}: {
  reason: "not-found" | "already-used" | "expired";
}) {
  const { t } = useTranslation();
  const copy = {
    "not-found": t("invite.errNotFound"),
    "already-used": t("invite.errUsed"),
    expired: t("invite.errExpired"),
  }[reason];

  return (
    <>
      <h1 className="font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong)">
        {t("invite.unavailable")}
      </h1>
      <p className="text-(length:--fs-body-sm) text-(--text-muted)">
        {copy} {t("invite.askAgain")}
      </p>
      <Button nativeButton={false} render={<Link href="/" />} className="self-start">
        {t("invite.goHome")}
      </Button>
    </>
  );
}
