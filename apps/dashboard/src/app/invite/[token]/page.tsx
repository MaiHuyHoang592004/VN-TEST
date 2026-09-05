
import { peekInvite } from "@/modules/identity/users/service";
import { getSessionUser } from "@/modules/core/session";
import { InviteCard, InviteUnavailable } from "@/components/pages/invite/invite-card";
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

  // The copy lives in a CLIENT component: there is no server-side t() in this
  // app, so a server page cannot translate its own words.
  if (!result.ok) {
    return shell(
      <InviteUnavailable reason={result.error} />,
    );
  }

  const { invite } = result;

  return shell(
    <InviteCard
      token={token}
      email={invite.email}
      roles={invite.roles}
      // ISO across the boundary: a Date does not survive it intact.
      expiresAt={invite.expiresAt.toISOString()}
      signedInAs={viewer?.email ?? null}
    />,
  );
}
