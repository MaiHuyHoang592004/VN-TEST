"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/global/form";
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

  const { submit, pending, formError } = useFormAction({
    action: () => acceptInviteAction(token),
    successMessage: "Welcome aboard",
    errorMessages: {
      "wrong-account": "You're signed in with a different email.",
      expired: "This invitation has expired.",
      "already-used": "This invitation has already been used.",
      "not-found": "This invitation link isn't valid.",
    },
    onSuccess: () => router.push("/"),
  });

  if (!signedInAs) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Sign in with {invitedEmail} to accept. If you don&apos;t have an account
          yet, create one with that address — you&apos;ll come straight back here.
        </p>
        {/* Round-trips through login and returns to this exact invite. */}
        <Button
          render={<Link href={`/?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`} />}
        >
          Sign in to accept
        </Button>
      </div>
    );
  }

  if (signedInAs.toLowerCase() !== invitedEmail.toLowerCase()) {
    return (
      <div className="flex flex-col gap-3">
        <p className="border-border rounded-md border px-3 py-2 text-sm">
          This invitation is for <strong>{invitedEmail}</strong>, but you&apos;re
          signed in as <strong>{signedInAs}</strong>.
        </p>
        <p className="text-muted-foreground text-sm">
          Sign out and sign back in with the invited address to accept it.
        </p>
        <Button variant="outline" render={<Link href="/api/auth/signout" />}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={() => submit(undefined as never)} disabled={pending}>
        {pending ? "Accepting…" : "Accept invitation"}
      </Button>
      {formError && (
        <p role="alert" className="text-destructive text-sm">
          {formError}
        </p>
      )}
    </div>
  );
}
