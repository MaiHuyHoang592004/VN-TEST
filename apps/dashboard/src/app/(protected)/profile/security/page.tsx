import { prisma } from "@gwprint/db";

import { requireUser } from "@/modules/core/guard";
import { SecurityPanel } from "@/components/pages/profile/security-panel";

export default async function SecurityPage() {
  const actor = await requireUser();
  // Which sign-in methods exist drives the UI: an OAuth-only account is
  // offered "set a password" rather than "change" it.
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: {
      email: true,
      pendingEmail: true,
      passwordHash: true,
      lastLoginAt: true,
      accounts: { select: { provider: true } },
    },
  });

  return (
    <SecurityPanel
      email={me.email}
      pendingEmail={me.pendingEmail}
      // Never send the hash to the browser — only whether one exists.
      hasPassword={Boolean(me.passwordHash)}
      hasGoogle={me.accounts.some((a) => a.provider === "google")}
      lastLoginAt={me.lastLoginAt?.toISOString() ?? null}
    />
  );
}
