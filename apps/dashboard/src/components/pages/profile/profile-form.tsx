"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { languages, useTranslation, type Locale } from "@/lib/i18n";
import {
  updateProfileAction,
  updatePreferencesAction,
} from "@/modules/identity/profile/actions";
import { FormField, useFormAction } from "@/components/global/form";
import { SettingsCard, SettingsStack } from "./settings-card";
import { PhoneInput } from "./phone-input";

export type ProfileFormValues = {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  taxId: string;
  locale: string;
  timezone: string;
  image: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

/** A short, sane list — a full IANA picker is a component of its own and this
 * covers where the business actually operates. */
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

/**
 * "Asia/Ho Chi Minh (GMT+7)" — the id stays the stored value, the offset is
 * only ever decoration.
 *
 * The offset is ASKED OF THE RUNTIME, never looked up in a table: half these
 * zones move twice a year, and a hardcoded map does not fail when it goes
 * stale, it just quietly lies. A runtime that declines to produce one (an
 * older ICU build, a zone it does not know) falls back to the bare name
 * rather than rendering "(undefined)".
 */
function timezoneLabel(tz: string): string {
  const name = tz.replace(/_/g, " ");
  let offset: string | undefined;
  try {
    offset = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
  } catch {
    offset = undefined;
  }
  return offset ? `${name} (${offset})` : name;
}

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const { t, setLocale } = useTranslation();
  const [values, setValues] = useState(initial);

  const set = <K extends keyof ProfileFormValues>(
    key: K,
    value: ProfileFormValues[K],
  ) => setValues((v) => ({ ...v, [key]: value }));

  // Each card enables its own Save only when ITS fields changed — a disabled
  // button is a clearer "nothing to do" than a no-op success toast.
  const changed = (keys: (keyof ProfileFormValues)[]) =>
    keys.some((k) => values[k] !== initial[k]);
  const detailsDirty = changed([
    "name", "phone", "companyName", "taxId", "avatarUrl",
  ]);
  const prefsDirty = changed(["locale", "timezone"]);

  /** Both cards post the WHOLE profile — the action validates it as one
   * object — but each owns its own button and its own dirty state, so saving
   * preferences doesn't silently commit half-typed details. */
  const payload = (over: Partial<ProfileFormValues> = {}) => {
    const v = { ...values, ...over };
    return {
      name: v.name,
      phone: v.phone,
      locale: v.locale,
      timezone: v.timezone,
      companyName: v.companyName,
      taxId: v.taxId,
      avatarUrl: v.avatarUrl ?? "",
    };
  };

  const details = useFormAction({
    action: (input: Record<string, string>) => updateProfileAction(input),
    successMessage: t("profile.form.saved"),
  });

  const prefs = useFormAction({
    // Its own action, so a blank display name on the other card can't block
    // someone from changing their language.
    action: (input: { locale: string; timezone: string }) =>
      updatePreferencesAction(input),
    successMessage: t("profile.form.saved"),
    // Apply the language to the running app the moment it is saved, rather
    // than waiting for the next sign-in to pick it up from the session.
    onSuccess: () => setLocale(values.locale as Locale),
  });

  const memberSince = new Date(initial.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <SettingsStack>
      <SettingsCard
        title={t("profile.form.identity")}
        description={t("profile.form.identityHint")}
        footer={`${t("profile.form.memberSince")} ${memberSince}`}
        action={
          <Button
            onClick={() => details.submit(payload())}
            disabled={!detailsDirty || details.pending}
          >
            {details.pending ? t("common.saving") : t("common.save")}
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {details.formError && (
            <p
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {details.formError}
            </p>
          )}
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarImage
                src={values.avatarUrl || values.image || undefined}
                alt={values.name}
              />
              <AvatarFallback>
                {(values.name || values.email).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <Label htmlFor="avatarUrl">{t("profile.form.avatarUrl")}</Label>
              <Input
                id="avatarUrl"
                value={values.avatarUrl ?? ""}
                placeholder="https://…"
                onChange={(e) => set("avatarUrl", e.target.value)}
                className="mt-1.5"
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                {t("profile.form.avatarHint")}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FormField label={t("profile.form.name")} error={details.fieldErrors.name} required>
                {(props) => (
                  <Input
                    {...props}
                    value={values.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <div>
              <Label htmlFor="email">{t("profile.form.email")}</Label>
              {/* Read-only on purpose: changing it goes through the verified
                  flow on the Security tab. That used to be explained ONLY in
                  this comment, which the person staring at the dead field
                  cannot read — so it is on the screen too, and described by
                  the field rather than floating beside it. */}
              <Input
                id="email"
                value={values.email}
                readOnly
                disabled
                aria-describedby="email-hint"
                className="mt-1.5"
              />
              <p id="email-hint" className="text-muted-foreground mt-1.5 text-xs">
                {t("profile.form.emailReadOnly")}
              </p>
            </div>
            <div>
              <FormField label={t("profile.form.phone")} error={details.fieldErrors.phone}>
                {(props) => (
                  <PhoneInput
                    {...props}
                    value={values.phone}
                    onChange={(v) => set("phone", v)}
                  />
                )}
              </FormField>
            </div>
            <div>
              <Label htmlFor="companyName">{t("profile.form.company")}</Label>
              <Input
                id="companyName"
                value={values.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="taxId">{t("profile.form.taxId")}</Label>
              <Input
                id="taxId"
                value={values.taxId}
                onChange={(e) => set("taxId", e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("profile.form.preferences")}
        description={t("profile.form.preferencesHint")}
        action={
          <Button
            onClick={() => prefs.submit({ locale: values.locale, timezone: values.timezone })}
            disabled={!prefsDirty || prefs.pending}
          >
            {prefs.pending ? t("common.saving") : t("common.save")}
          </Button>
        }
      >
        {/* Same treatment as the identity card's failure: a save that did not
            happen is an ERROR, not a footnote — announced, and coloured like
            one. It used to sit in the muted footer strip, unstyled and silent
            to a screen reader. */}
        {prefs.formError && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm"
          >
            {prefs.formError}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="locale">{t("profile.form.language")}</Label>
            <Select
              value={values.locale}
              onValueChange={(v) => v && set("locale", v)}
            >
              <SelectTrigger id="locale" className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.flag} {l.nativeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="timezone">{t("profile.form.timezone")}</Label>
            <Select
              value={values.timezone}
              onValueChange={(v) => v && set("timezone", v)}
            >
              <SelectTrigger id="timezone" className="mt-1.5 w-full">
                <SelectValue>{timezoneLabel(values.timezone)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {timezoneLabel(tz)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsCard>
    </SettingsStack>
  );
}
