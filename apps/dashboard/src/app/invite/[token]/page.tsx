import Link from "next/link";

import { peekInvite } from "@/modules/identity/users/service";
import { getSessionUser } from "@/modules/core/session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AcceptInvite } from "@/components/pages/invite/accept-invite";
import { GwpMark, Surface } from "@/components/ds";

/**
 * The page the emailed invitation link opens.
 *
 * Deliberately OUTSIDE the (protected) group: the recipient usually has no
 * account yet, so requiring a session first would bounce them to login with no
 * explanation of why they're there. Instead the invitation is shown, then they
 * sign in, then they accept.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [result, viewer] = await Promise.all([peekInvite(token), getSessionUser()]);

  // A single centred white card on the sky ground, with the brand mark above
  // it — the DS's system-page composition. Sky is the page, so the card is the
  // only surface here and it does not need a second one behind it.
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-6 py-24">
      <span className="flex justify-center">
        <GwpMark size={40} tone="sky" />
      </span>
      <Surface radius="card" shadow="lg" className="flex flex-col gap-5">
        {children}
      </Surface>
    </main>
  );

  if (!result.ok) {
    const copy = {
      "not-found": "This invitation link isn't valid.",
      "already-used": "This invitation has already been used.",
      expired: "This invitation has expired.",
    }[result.error];
    return shell(
      <>
        <h1 className="font-display text-(length:--fs-display-sm) leading-(--lh-heading) font-(--fw-display) text-(--text-strong)">
          Invitation unavailable
        </h1>
        <p className="text-(length:--fs-body-sm) text-(--text-muted)">
          {copy} Ask whoever invited you to send a new one.
        </p>
        <Button render={<Link href="/" />} className="self-start">
          Go to GWPrintz
        </Button>
      </>,
    );
  }

  const { invite } = result;

  return shell(
    <>
      <div>
        <h1 className="text-2xl font-medium">You&apos;ve been invited</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          to join GWPrintz as <strong>{invite.email}</strong>
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {invite.roles.map((r) => (
          <Badge key={r} variant="secondary">
            {r.toLowerCase().replace("_", " ")}
          </Badge>
        ))}
      </div>

      <AcceptInvite
        token={token}
        invitedEmail={invite.email}
        signedInAs={viewer?.email ?? null}
      />
    </>,
  );
}
