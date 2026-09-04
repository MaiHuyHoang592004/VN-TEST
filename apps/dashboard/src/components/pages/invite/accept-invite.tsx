"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/global/form";
import { useTranslation } from "@/lib/i18n";
import { acceptInviteAction } from "@/modules/identity/users/actions";

/**
 * The three states an invitation link can find you in:
 *   signed out          → sign in first (the invite survives the round trip)
 *   signed in, wrong    → say so plainly; accepting would grant the roles to
 *   account               the wrong person
 *   signed in, right    → accept
 */
export function AcceptInvite({
  token,
  invitedEmail,
  signedInAs,
}: {
  token: string;
  invitedEmail: string;
  signedInAs: string | null;
}) {
  const router = useRouter();
  const { t } = useTranslation();

  const { submit, pending, formError } = useFormAction({
    action: () => acceptInviteAction(token),
    successMessage: t("invite.welcome"),
    errorMessages: {
      "wrong-account": t("invite.errWrongAccount"),
      expired: t("invite.errExpired"),
      "already-used": t("invite.errUsed"),
      "not-found": t("invite.errNotFound"),
    },
    onSuccess: () => router.push("/"),
  });

  if (!signedInAs) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          {t("invite.signInPrompt")}
        </p>
        {/* Round-trips through login and returns to this exact invite. */}
        <Button
          render={<Link href={`/?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`} />}
        >
          {t("invite.signIn")}
        </Button>
      </div>
    );
  }

  if (signedInAs.toLowerCase() !== invitedEmail.toLowerCase()) {
    return (
      <div className="flex flex-col gap-3">
        <p className="border-border rounded-md border px-3 py-2 text-sm">
          {/* Split on the placeholders so word order stays the translator's —
              Japanese and Arabic do not put the two addresses where English
              does. */}
          {t("invite.wrongAccount")
            .split(/(\{invited\}|\{current\})/g)
            .map((part, i) =>
              part === "{invited}" ? (
                <strong key={i}>{invitedEmail}</strong>
              ) : part === "{current}" ? (
                <strong key={i}>{signedInAs}</strong>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
        </p>
        <p className="text-muted-foreground text-sm">
          {t("invite.wrongAccountHint")}
        </p>
        <Button variant="outline" render={<Link href="/api/auth/signout" />}>
          {t("invite.signOut")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={() => submit(undefined as never)} disabled={pending}>
        {pending ? t("invite.accepting") : t("invite.accept")}
      </Button>
      {formError && (
        <p role="alert" className="text-destructive text-sm">
          {formError}
        </p>
      )}
    </div>
  );
}
