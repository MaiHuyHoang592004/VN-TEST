import { Page, PageSection } from "@/components/ds";
import { getMyProfile } from "@/modules/identity/profile/queries";

import { PreferencesCard } from "@/components/pages/settings/preferences-card";
import { SettingsDirectory } from "@/components/pages/settings/settings-directory";
import { SettingsHeader } from "@/components/pages/settings/settings-header";

/**
 * Account and workspace settings.
 *
 * Deliberately SMALL. Language and time zone are the only general preferences
 * this platform actually stores (`User.locale` / `User.timezone`, written by
 * `updatePreferencesAction`), so they are the only things editable here.
 * Everything else that can be configured — identity, password, billing, API
 * keys, webhooks, notifications, administration — already has a screen that
 * owns it, and is linked rather than duplicated.
 *
 * No notification toggles, no theme switch, no "workspace" options: none of
 * those are backed by a column, an action or a schema anywhere in this app,
 * and a control that silently saves nothing is worse than its absence.
 *
 * The narrow container matches /profile, because this is the same kind of
 * single-column settings reading.
 */
export default async function SettingsPage() {
  const me = await getMyProfile();

  return (
    <Page className="max-w-3xl">
      <SettingsHeader />
      <PageSection>
        <PreferencesCard initial={{ locale: me.locale, timezone: me.timezone }} />
      </PageSection>
      <SettingsDirectory />
    </Page>
  );
}
