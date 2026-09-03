import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

import { auth } from "@opcreative/auth";

import { AppProviders } from "@/components/global/providers";
import { Navbar } from "@/components/global/layout/navbar";
import { Footer } from "@/components/global/layout/footer";
import { AppSidebar } from "@/components/global/layout/sidebar/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

// Self-hosted Geist Variable pulled from vercel.com (OFL — see fonts/LICENSE.txt).
// Google Fonts' Geist ships without the ss01–ss12 stylistic sets, so the
// font-feature-settings in globals.css only take effect on this binary.
const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    // suppressHydrationWarning: next-themes stamps the theme class on <html> before hydration
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* pb: clearance for the floating mobile dock */}
      <body className="flex min-h-full flex-col pb-24 md:pb-0">
        {/* First child of <body>: restores the dragged sidebar width before
            the sidebar paints (a <script> outside <head>/<body> is invalid
            HTML and breaks hydration). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var w=localStorage.getItem('sidebar:width');if(w)document.documentElement.style.setProperty('--sidebar-width-user',w)}catch(e){}`,
          }}
        />
        <AppProviders user={user} accountLocale={session?.user?.locale}>
          {/* Full-height icon-rail sidebar; navbar + content live in the inset */}
          <SidebarProvider
            style={
              {
                // Follows the user's dragged width (set on <html>), else default
                "--sidebar-width": "var(--sidebar-width-user, 15rem)" /* 240px, matches vercel.com */,
              } as React.CSSProperties
            }
          >
            <AppSidebar />
            <SidebarInset className="min-w-0">
              <Navbar />
              {children}
              {/* Marketing footer is for the signed-out surface only */}
              {!user && <Footer />}
            </SidebarInset>
          </SidebarProvider>
        </AppProviders>
      </body>
    </html>
  );
}
