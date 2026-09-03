/**
 * Global providers.
 * AppProviders is the single wrapper the root layout mounts.
 */

"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ThemeProvider } from "@/components/global/theme";
import { I18nProvider, type Locale } from "@/lib/i18n";
import { updatePreferencesAction } from "@/modules/identity/profile/actions";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider, type AuthUser } from "./auth-provider";

export { AuthProvider, useAuth, type AuthUser } from "./auth-provider";

export function AppProviders({
  user,
  accountLocale,
  userTimezone = "Asia/Ho_Chi_Minh",
  children,
}: {
  user: AuthUser | null;
  accountLocale?: string;
  /** Sent alongside the locale so the preferences write is complete. */
  userTimezone?: string;
  children: ReactNode;
}) {
  // One QueryClient per app instance (in state so HMR/StrictMode don't recreate it)
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      /* GWP ships no dark palette (globals.css: `.dark` is a no-op).
         Forcing light here — not just defaulting to it — matters because a
         returning user may already have `theme=dark` persisted in
         localStorage from before this migration; next-themes would
         otherwise re-apply it. The toggle is also removed from the shell
         (navbar.tsx, app-sidebar.tsx) so there is no way back in. Task 17
         is expected to remove next-themes/ThemeProvider entirely. */
      forcedTheme="light"
    >
      <QueryClientProvider client={queryClient}>
        <I18nProvider
          accountLocale={accountLocale}
          // Signed out there is no account to save to; the browser copy is all
          // there is.
          onPersist={
            user
              ? (locale: Locale) => {
                  void updatePreferencesAction({ locale, timezone: userTimezone });
                }
              : undefined
          }
        >
          <AuthProvider user={user}>
            <TooltipProvider>{children}</TooltipProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
