"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Package, ShieldCheck, Wallet } from "lucide-react";

import { register } from "./auth-actions";
import { GoogleIcon } from "./google-icon";
import { PasswordInput } from "./password-input";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { CraftCut, GwpMark } from "@/components/ds";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

type Mode = "login" | "signup" | "code";

export function LoginScreen({
  error: urlError,
  signup,
}: {
  error?: string;
  signup?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  // /?signup=1 (navbar "Sign up") opens straight into the signup form.
  const [mode, setMode] = useState<Mode>(signup ? "signup" : "login");
  // Navbar links are client-side navigations: this component stays mounted, so
  // the initial state above never re-runs. Re-sync when the param changes.
  const [prevSignup, setPrevSignup] = useState(signup);
  if (signup !== prevSignup) {
    setPrevSignup(signup);
    setMode(signup ? "signup" : "login");
  }
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // Why the OTP was sent: plain sign-in, or forgot-password (→ /?reset=1).
  const [purpose, setPurpose] = useState<"signin" | "reset">("signin");
  const [busy, setBusy] = useState(false);
  // error is an i18n key; urlError comes from Auth.js redirects (bad OTP).
  const [error, setError] = useState<string | null>(
    urlError ? "auth.invalidCode" : null,
  );

  const sendOtp = async () => {
    const res = await signIn("resend", { email, redirect: false });
    if (res?.error) {
      setError("auth.sendFailed");
    } else {
      setCode("");
      setMode("code");
    }
  };

  /**
   * Where to land after signing in. Defaults home, but an invitation link
   * sends people here with ?callbackUrl=/invite/<token> — without honouring
   * it they sign in, land on the dashboard, and the invitation is simply lost.
   *
   * Only same-origin paths are accepted: an attacker-supplied absolute URL
   * would turn our login into an open redirect.
   */
  const rawCallback = searchParams.get("callbackUrl") ?? "";
  const callbackUrl = rawCallback.startsWith("/") && !rawCallback.startsWith("//")
    ? rawCallback
    : "/";

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (!res?.error) {
      window.location.href = callbackUrl;
      return;
    }
    // Right password, unverified email → finish verification with a code.
    if (res.code === "unverified") await sendOtp();
    else setError("auth.invalidCredentials");
    setBusy(false);
  };

  const submitSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await register({ name, email, password });
    if (res.ok) {
      await sendOtp(); // verify the address → verifying also signs them in
    } else {
      setError(
        res.error === "exists"
          ? "auth.accountExists"
          : res.error === "weak-password"
            ? "auth.weakPassword"
            : "auth.invalidEmail",
      );
    }
    setBusy(false);
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // Email-provider verification is a GET to the callback URL; wrong/expired
    // codes bounce back to "/?error=Verification" (shown inline).
    const url = new URL("/api/auth/callback/resend", window.location.origin);
    url.searchParams.set("email", email);
    url.searchParams.set("token", code);
    url.searchParams.set(
      "callbackUrl",
      purpose === "reset" ? "/?reset=1" : callbackUrl,
    );
    window.location.href = url.toString();
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword("");
    // Keep the URL in step with the view, or the navbar link for the mode we
    // just left becomes a no-op navigation and can't switch back.
    if (next !== "code") {
      router.replace(next === "signup" ? "/?signup=1" : "/", { scroll: false });
    }
  };

  return (
    // min-h fills the viewport below the 60px navbar — footer only appears on scroll
    <main className="relative flex min-h-[calc(100svh-60px)] flex-1 flex-col overflow-hidden px-6 py-16">
      {/* The app's second brand moment. Sky is the page; ONE Craft Cut sweeps
          the sky into the shell along the bottom, and the GwpMark sits above
          the card. That is two marks on the screen, the DS's per-screen
          maximum, so nothing else here may add a third. */}
      <CraftCut
        className="pointer-events-none absolute inset-x-0 bottom-0"
        from="var(--surface-canvas-soft)"
        to="var(--surface-shell)"
        depth={72}
        sweep="left"
      />

      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-14 lg:flex-row lg:items-center lg:justify-between lg:gap-20">
        {/* Brand side — the reason to sign in. Sits above the card on small
            screens (centered, smaller headline), beside it from lg up. */}
        <section className="flex max-w-md flex-1 flex-col gap-5 text-center lg:gap-6 lg:text-left">
          <span className="eyebrow flex items-center justify-center gap-2 lg:justify-start">
            <span className="size-1.5 rounded-full bg-(--action-500)" />
            {t("auth.panel.eyebrow")}
          </span>
          <h1 className="text-display-sm sm:text-display-md lg:text-display-lg text-balance">
            {t("auth.panel.headline")}{" "}
            <span className="text-(--text-strong)">{t("auth.panel.headlineAccent")}</span>
          </h1>
          <p className="text-muted-foreground text-sm text-balance lg:text-base">
            {t("auth.panel.subtitle")}
          </p>
          {/* w-fit + mx-auto keeps the rows left-aligned to each other while the
              block itself stays centered under the headline on mobile. */}
          <ul className="mx-auto flex w-fit flex-col gap-3 text-left lg:mx-0 lg:mt-2 lg:gap-4">
            {[
              { icon: Package, key: "orders", tone: "stroke-action-500" },
              { icon: Wallet, key: "wallet", tone: "stroke-sky-500" },
              { icon: ShieldCheck, key: "secure", tone: "stroke-green-600" },
            ].map(({ icon: Icon, key, tone }) => (
              <li key={key} className="flex items-center gap-3 text-sm">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-xs) bg-(--surface-content)">
                  <Icon className={`size-4 ${tone}`} />
                </span>
                {t(`auth.panel.features.${key}`)}
              </li>
            ))}
          </ul>
        </section>

        {/* The card is the DS's white data surface floating on sky, with the
            drawer-weight shadow doing the lifting rather than a ring. */}
        <Card className="w-full max-w-sm bg-(--surface-data) shadow-(--shadow-lg) lg:w-[380px] lg:max-w-none lg:shrink-0">
        <CardHeader className="text-center">
          {/* The brand mark above the form — sky, never navy: navy "pulls the
              brand toward SaaS/admin", which is the look this screen exists to
              be the opposite of. */}
          <span className="mx-auto mb-2 flex justify-center">
            <GwpMark size={40} tone="sky" />
          </span>
          {/* font-semibold restores the display token's 600: CardTitle's base
              font-medium sets --tw-font-weight, which beats the token default. */}
          <CardTitle className="text-display-md sm:text-display-lg font-semibold text-(--text-strong)">
            {mode === "signup" ? t("auth.signupTitle") : t("auth.title")}
          </CardTitle>
          <CardDescription>
            {mode === "code" ? (
              <>
                {t("auth.codeSubtitle")}{" "}
                <span className="text-foreground font-medium">{email}</span>
              </>
            ) : mode === "signup" ? (
              t("auth.signupSubtitle")
            ) : (
              t("auth.subtitle")
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {mode !== "code" && (
            <>
              <Button
                variant="outline"
                className="hover-lift w-full"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void signIn("google", { redirectTo: callbackUrl });
                }}
              >
                <GoogleIcon className="size-4.5" />
                {t("auth.google")}
              </Button>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-muted-foreground text-xs uppercase">
                  {t("auth.or")}
                </span>
                <Separator className="flex-1" />
              </div>
            </>
          )}

          {mode === "login" && (
            <form onSubmit={submitLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <button
                    type="button"
                    className="text-action-500 text-xs underline-offset-4 transition-colors hover:underline"
                    disabled={busy}
                    onClick={async () => {
                      if (!email) {
                        setError("auth.enterEmailFirst");
                        return;
                      }
                      setBusy(true);
                      setError(null);
                      setPurpose("reset");
                      await sendOtp();
                      setBusy(false);
                    }}
                  >
                    {t("auth.forgotPassword")}
                  </button>
                </div>
                <PasswordInput
                  id="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Spinner /> : null}
                {t("nav.login")}
              </Button>
              {/* The third sign-in. Each of the three reads as a different
                  weight of action: password is the one Action Blue submit,
                  Google is the outline pill, and the code path is a link. */}
              <Button
                type="button"
                variant="link"
                size="sm"
                className="mx-auto"
                disabled={busy}
                onClick={async () => {
                  if (!email) {
                    setError("auth.enterEmailFirst");
                    return;
                  }
                  setBusy(true);
                  setError(null);
                  setPurpose("signin");
                  await sendOtp();
                  setBusy(false);
                }}
              >
                {t("auth.useCode")}
              </Button>
            </form>
          )}

          {mode === "signup" && (
            <form onSubmit={submitSignup} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("auth.name")}</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <PasswordInput
                  id="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {t("auth.passwordHint")}
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Spinner /> : null}
                {t("auth.createAccount")}
              </Button>
            </form>
          )}

          {mode === "code" && (
            <form
              onSubmit={submitCode}
              className="flex flex-col items-center gap-4"
            >
              <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <Button
                type="submit"
                className="w-full"
                disabled={busy || code.length < 6}
              >
                {busy ? <Spinner /> : null}
                {t("auth.verify")}
              </Button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 transition-colors hover:underline"
                onClick={() => switchMode("login")}
              >
                {t("auth.back")}
              </button>
            </form>
          )}

          {error && (
            <p className="text-destructive text-center text-sm" role="alert">
              {t(error)}
            </p>
          )}

          {mode !== "code" && (
            <p className="text-muted-foreground text-center text-sm">
              {mode === "login" ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
              <button
                type="button"
                className="text-action-500 font-medium underline-offset-4 hover:underline"
                onClick={() =>
                  switchMode(mode === "login" ? "signup" : "login")
                }
              >
                {mode === "login" ? t("nav.signup") : t("nav.login")}
              </button>
            </p>
          )}
        </CardContent>
        </Card>
      </div>
    </main>
  );
}
