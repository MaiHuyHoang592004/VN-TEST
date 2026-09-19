import Link from "next/link";

import { Card, Muted } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="wrap" style={{ maxWidth: 480 }}>
      <h1 style={{ letterSpacing: "-0.02em" }}>Not found</h1>
      <Card>
        <p style={{ margin: 0 }}>
          <Muted>
            There is nothing here, or nothing here for this account. Both look the same on purpose.
          </Muted>
        </p>
      </Card>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/">← Your workspaces</Link>
      </p>
    </main>
  );
}
