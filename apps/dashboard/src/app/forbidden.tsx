import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Rendered whenever a page calls forbidden() — the user is signed in but lacks
 * the permission. Deliberately says so plainly rather than pretending the page
 * doesn't exist: they're a colleague who took a wrong turn, not an intruder,
 * and "ask an admin" is the actual next step.
 */
export default function Forbidden() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="text-muted-foreground font-mono text-sm">403</p>
      <h1 className="text-2xl font-medium">You don&apos;t have access to this</h1>
      <p className="text-muted-foreground text-sm">
        Your account doesn&apos;t have permission for this page. If you think it
        should, ask an administrator to update your role.
      </p>
      <Button render={<Link href="/" />} className="mt-2">
        Back to dashboard
      </Button>
    </main>
  );
}
