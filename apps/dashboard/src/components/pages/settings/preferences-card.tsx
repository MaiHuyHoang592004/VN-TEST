"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFormAction } from "@/components/global/form";
import { SettingsCard } from "@/components/pages/profile/settings-card";
import { languages, useTranslation, type Locale } from "@/lib/i18n";
import { updatePreferencesAction } from "@/modules/identity/profile/actions";


/**
 * The only setting on this page that is EDITED here, because it is the only
 * general one with something real behind it: `updatePreferencesAction` →
 * `preferencesSchema` → the user's `locale` and `timezone` columns.
 *
 * Everything else configurable in this app is owned by a screen of its own,
 * and is linked from <SettingsDirectory> rather than mirrored here. A toggle
 * that saves nothing is worse than no toggle at all, so nothing else was
 * invented to fill the page out.
 *
 * The card itself is the profile's SettingsCard — the same panel, not a second
 * one that drifts.
 */
const TIMEZONES = [
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
];

export function PreferencesCard({
  initial,
}: {
  initial: { locale: string; timezone: string };
}) {
  const { t } = useTranslation();
  const { setLocale } = useTranslation();
  const [values, setValues] = useState(initial);

  const dirty = values.locale !== initial.locale || values.timezone !== initial.timezone;

  const prefs = useFormAction({
    action: (input: { locale: string; timezone: string }) => updatePreferencesAction(input),
    successMessage: t("settings.preferences.saved"),
    // Apply the language to the running app the moment it is saved, rather
    // than waiting for the next sign-in to pick it up from the session.
    onSuccess: () => setLocale(values.locale as Locale),
  });

  return (
    <SettingsCard
      title={t("settings.preferences.title")}
      description={t("settings.preferences.hint")}
      footer={prefs.formError ?? t("settings.preferences.footer")}
      action={
        <Button onClick={() => prefs.submit(values)} disabled={!dirty || prefs.pending}>
          {prefs.pending ? t("common.saving") : t("common.save")}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="settings-locale">{t("settings.preferences.language")}</Label>
          <Select
            value={values.locale}
            onValueChange={(v) => v && setValues((s) => ({ ...s, locale: v }))}
          >
            <SelectTrigger id="settings-locale" className="mt-1.5 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.nativeName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="settings-timezone">{t("settings.preferences.timezone")}</Label>
          <Select
            value={values.timezone}
            onValueChange={(v) => v && setValues((s) => ({ ...s, timezone: v }))}
          >
            <SelectTrigger id="settings-timezone" className="mt-1.5 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </SettingsCard>
  );
}
