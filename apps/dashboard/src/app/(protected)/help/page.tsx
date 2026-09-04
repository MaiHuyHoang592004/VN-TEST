import { Page } from "@/components/ds";
import { requireUser } from "@/modules/core/guard";

import { HelpContent } from "@/components/pages/help/help-content";
import { HelpHeader } from "@/components/pages/help/help-header";

/**
 * Help & support — the one page in this app with no query behind it, and
 * correctly so: what GWPrintz does, where each area of the dashboard is, and
 * the single supported way to reach a person, which is a ticket.
 *
 * Guarded like every other route in the group so the links below are filtered
 * against a real session rather than rendered to a signed-out visitor.
 */
export default async function HelpPage() {
  await requireUser();

  return (
    <Page>
      <HelpHeader />
      <HelpContent />
    </Page>
  );
}
