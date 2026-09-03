"use client";

import { useState } from "react";

import { changePassword } from "./auth-actions";
import { PasswordInput } from "./password-input";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

/** Shown at /?reset=1 right after the OTP sign-in of the forgot-password
 * flow — the session proves identity, so we just take the new password. */
export function ResetPassword() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await changePassword({ password });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    setError(res.error === "weak-password" ? "auth.weakPassword" : "auth.sendFailed");
    setBusy(false);
  };

  return (
    // min-h fills the viewport below the 60px navbar — footer only appears on scroll
    <main className="relative flex min-h-[calc(100svh-60px)] flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div aria-hidden className="grid-bg radial-fade absolute inset-0 -z-10" />

      <Card className="bg-background shadow-ds-5 w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-display-md sm:text-display-lg font-semibold">
            {t("auth.resetTitle")}
          </CardTitle>
          <CardDescription>{t("auth.resetSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">{t("auth.newPassword")}</Label>
              <PasswordInput
                id="new-password"
                required
                minLength={8}
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {t("auth.passwordHint")}
              </p>
            </div>
            <Button type="submit" className="btn-shine w-full" disabled={busy}>
              {busy ? <Spinner /> : null}
              {t("auth.updatePassword")}
            </Button>
            {error && (
              <p className="text-destructive text-center text-sm" role="alert">
                {t(error)}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
