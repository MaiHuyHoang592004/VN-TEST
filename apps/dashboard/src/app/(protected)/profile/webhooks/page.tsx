import { prisma } from "@gwprint/db";

import { requireUser } from "@/modules/core/guard";
import { WebhooksPanel } from "@/components/pages/profile/webhooks-panel";

export default async function WebhooksPage() {
  const actor = await requireUser();
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { webhookUrl: true, webhookSecret: true },
  });

  return (
    <WebhooksPanel
      webhookUrl={me.webhookUrl ?? ""}
      // Only whether a secret exists — the value itself never leaves the server.
      hasSecret={Boolean(me.webhookSecret)}
    />
  );
}
