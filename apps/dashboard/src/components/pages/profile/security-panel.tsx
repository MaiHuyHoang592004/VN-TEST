"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { signIn } from "next-auth/react";
import { GoogleIcon } from "@/components/pages/auth/google-icon";
import { useTranslation } from "@/lib/i18n";
import {
  changePasswordAction,
  requestEmailChangeAction,
  confirmEmailChangeAction,
  signOutEverywhereAction,
} from "@/modules/identity/profile/actions";
import { SettingsCard, SettingsStack } from "./settings-card";

/** Maps a service error code to a translated message. Codes (not prose) cross
 * the wire, so translations stay a UI concern. */
function messageFor(t: (k: string) => string, code: string) {
  const map: Record<string, string> = {
    "wrong-password": "profile.security.errWrongPassword",
    "no-password-set": "profile.security.errNoPassword",
    "weak-password": "profile.security.errWeakPassword",
    "email-taken": "profile.security.errEmailTaken",
    "invalid-code": "profile.security.errInvalidCode",
    "no-pending": "profile.security.errNoPending",
  };
  return map[code] ? t(map[code]) : code;
}

export function SecurityPanel({
  email,
  pendingEmail,
  hasPassword,
  hasGoogle,
  lastLoginAt,
}: {
  email: string;
  pendingEmail: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
  lastLoginAt: string | null;
}) {
  const { t } = useTranslation();
  const [pending, startTransition] = useTransition();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(Boolean(pendingEmail));

  const run = (fn: () => Promise<unknown>, onOk: () => void, okMsg: string) =>
    startTransition(async () => {
      try {
        const res = (await fn()) as { ok: boolean; error?: string };
        if (res && res.ok === false) {
          toast.error(messageFor(t, res.error ?? "unknown"));
          return;
        }
        onOk();
        toast.success(okMsg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.error"));
      }
    });

  return (
    <SettingsStack>
      <SettingsCard
        title={t("profile.security.methods")}
        description={t("profile.security.methodsHint")}
        footer={
          lastLoginAt
            ? `${t("profile.security.lastSignIn")} ${new Date(lastLoginAt).toLocaleString()}`
            : undefined
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge product={hasGoogle ? "default" : "secondary"}>
              Google {hasGoogle ? "✓" : "—"}
            </Badge>
            <Badge product={hasPassword ? "default" : "secondary"}>
              {t("profile.security.password")} {hasPassword ? "✓" : "—"}
            </Badge>
            <Badge product="default">{t("profile.security.emailCode")} ✓</Badge>
          </div>

          {/* A password user can add Google as a second way in. Auth.js links
              the account to this same user because the config allows same-email
              linking and Google has already proved they own the address. Same
              button as the login screen, so it's recognisably the same action. */}
          {!hasGoogle && (
            <div className="flex flex-col gap-2">
              <Button
                product="outline"
                className="hover-lift w-full sm:w-auto"
                disabled={pending}
                onClick={() => signIn("google", { redirectTo: "/profile/security" })}
              >
                <GoogleIcon className="size-4.5" />
                {t("profile.security.connectGoogle")}
              </Button>
              <p className="text-muted-foreground text-xs">
                {t("profile.security.connectGoogleHint")}
              </p>
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("profile.security.changeEmail")}
        description={t("profile.security.changeEmailHint")}
        footer={
          pendingEmail
            ? `${t("profile.security.pendingEmail")} ${pendingEmail}`
            : email
        }
        action={
          awaitingCode ? (
            <Button
              disabled={pending || code.length < 6}
              onClick={() =>
                run(
                  () => confirmEmailChangeAction(code),
                  () => {
                    setAwaitingCode(false);
                    setCode("");
                  },
                  t("profile.security.emailChanged"),
                )
              }
            >
              {t("profile.security.verify")}
            </Button>
          ) : (
            <Button
              disabled={pending || !newEmail}
              onClick={() =>
                run(
                  () => requestEmailChangeAction({ email: newEmail }),
                  () => setAwaitingCode(true),
                  t("profile.security.codeSent"),
                )
              }
            >
              {t("profile.security.sendCode")}
            </Button>
          )
        }
      >
        {awaitingCode ? (
          <div className="max-w-xs">
            <Label htmlFor="code">{t("profile.security.enterCode")}</Label>
            <Input
              id="code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="mt-1.5 tracking-[0.4em]"
              placeholder="000000"
            />
          </div>
        ) : (
          <div className="max-w-sm">
            <Label htmlFor="newEmail">{t("profile.security.newEmail")}</Label>
            <Input
              id="newEmail"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="mt-1.5"
              placeholder="you@example.com"
            />
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title={t("profile.security.changePassword")}
        description={
          hasPassword
            ? t("profile.security.changePasswordHint")
            : t("profile.security.setPasswordHint")
        }
        action={
          <Button
            disabled={pending || !hasPassword || !current || next.length < 8}
            onClick={() =>
              run(
                () =>
                  changePasswordAction({
                    currentPassword: current,
                    newPassword: next,
                  }),
                () => {
                  setCurrent("");
                  setNext("");
                },
                t("profile.security.passwordChanged"),
              )
            }
          >
            {t("profile.security.updatePassword")}
          </Button>
        }
        footer={t("profile.security.passwordSignsOut")}
      >
        {hasPassword && (
          <div className="grid max-w-lg gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="current">
                {t("profile.security.currentPassword")}
              </Label>
              <Input
                id="current"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="next">{t("profile.security.newPassword")}</Label>
              <Input
                id="next"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title={t("profile.security.signOutAll")}
        description={t("profile.security.signOutAllHint")}
        action={
          <Button
            product="destructive"
            disabled={pending}
            onClick={() =>
              run(
                () => signOutEverywhereAction(),
                () => {},
                t("profile.security.signedOutAll"),
              )
            }
          >
            {t("profile.security.signOutAll")}
          </Button>
        }
      />
    </SettingsStack>
  );
}
