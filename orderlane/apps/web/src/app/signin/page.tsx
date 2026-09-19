import { safeRedirectPath } from "@orderlane/core/redirect";
import { redirect } from "next/navigation";

import { Card, Muted } from "@/components/ui";
import { currentViewer } from "@/lib/session";
import { SignInForm } from "./signin-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // The same guard the actions use. This site is the one that matters: it is a
  // plain GET, so it redirects an already-signed-in visitor with no form and no
  // JavaScript involved.
  const target = safeRedirectPath(next);

  // Already signed in: a sign-in page is not a useful thing to show somebody
  // who is.
  if (await currentViewer()) redirect(target);

  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <h1 style={{ letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>Orderlane</h1>
      <p style={{ marginTop: 0 }}>
        <Muted>Sign in to your workspace.</Muted>
      </p>

      <Card style={{ marginTop: "1.5rem" }}>
        <SignInForm next={target} />
      </Card>

      {process.env.NODE_ENV !== "production" ? (
        <p style={{ fontSize: "0.85rem", marginTop: "1.5rem" }}>
          <Muted>
            Seeded demo accounts: <code>owner@example.com</code> and{" "}
            <code>second-owner@example.com</code>, password <code>demo passphrase 2026</code>. With no
            mailer configured, sign-in codes are printed to the server console.
          </Muted>
        </p>
      ) : null}
    </main>
  );
}
