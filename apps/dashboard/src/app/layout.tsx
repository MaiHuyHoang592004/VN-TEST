import type { Metadata } from "next";
import { Baloo_2, Nunito_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

import { auth } from "@opcreative/auth";

import { AppProviders } from "@/components/global/providers";
import { Navbar } from "@/components/global/layout/navbar";
import { Footer } from "@/components/global/layout/footer";

// GWP type rationing (DS SKILL.md rule 4): Baloo 2 is brand moments, page
// titles and KPI numerals ONLY; Nunito Sans runs the UI; IBM Plex Mono carries
// order IDs, SKUs, tracking numbers and money. Loading all three through
// next/font keeps them self-hosted — the DS's own sheet uses a Google Fonts
// @import, which we strip in gwp.theme.css.
const displayFont = Baloo_2({
  variable: "--font-display-face",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const bodyFont = Nunito_Sans({
  variable: "--font-body-face",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpCreative — Dashboard",
  description: "Your orders, products and wallet in one place.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Session resolved once per request; context distributes it client-side.
  const session = await auth();
  const user = session?.user
    ? {
        displayName: session.user.name ?? null,
        email: session.user.email ?? null,
        photoURL: session.user.image ?? null,
        roles: session.user.roles ?? [],
      }
    : null;

  return (
    // suppressHydrationWarning: next-themes stamps the theme class on <html>
    // before hydration. The theme is a no-op after the token migration (the DS
    // ships no dark palette) but the provider stays wired.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      {/* SKY IS THE PAGE. The body is the sky canvas and content floats on it —
          not a white app with a sky accent. pb: clearance for the floating
          mobile dock. */}
      <body className="flex min-h-full flex-col bg-(--surface-canvas) pb-24 md:pb-0">
        <AppProviders user={user} accountLocale={session?.user?.locale}>
          {/* No SidebarProvider and no persistent rail: GWP navigation is the
              floating cream TopNav, and the section rail opens as a sheet from
              the nav's own button (SidebarNavButtons). The provider the sheet
              needs lives inside <Navbar/>, wrapping only the nav subtree. */}
          <Navbar />
          {children}
          {/* Marketing footer is for the signed-out surface only */}
          {!user && <Footer />}
        </AppProviders>
      </body>
    </html>
  );
}
