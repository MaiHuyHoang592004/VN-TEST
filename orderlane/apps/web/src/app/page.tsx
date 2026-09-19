import Link from "next/link";

import { Badge, Card, Muted } from "@/components/ui";
import { currentViewer, myTenants } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The workspaces this person belongs to.
 *
 * Before authentication this page listed every tenant in the database, which
 * was fine for a demo and wrong as a product. A person sees the merchants they
 * are a member of, and no others — the same membership query that scopes every
 * page below it.
 */
export default async function Home() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/signin");

  const tenants = await myTenants(viewer.userId);

  return (
    <main className="wrap">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>Orderlane</h1>
          <p style={{ marginTop: 0 }}>
            <Muted>{viewer.name ? `${viewer.name} · ` : ""}{viewer.email}</Muted>
          </p>
        </div>
        <SignOutButton />
      </div>

      {tenants.length === 0 ? (
        <Card style={{ marginTop: "2rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>No workspaces yet</h2>
          <p style={{ marginBottom: 0 }}>
            <Muted>
              This account is not a member of any merchant. Run <code>npm run db:seed</code> for demo
              data, or ask an owner to invite you.
            </Muted>
          </p>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "2rem" }}>
          {tenants.map((tenant) => (
            <Card key={tenant.slug}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
                    <Link href={`/t/${tenant.slug}/orders`}>{tenant.name}</Link>
                  </h2>
                  <Muted>{tenant.slug}</Muted>
                </div>
                <span style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
                  <Badge tone="neutral">{tenant.role.toLowerCase()}</Badge>
                  <Muted>
                    {tenant._count.orders} order{tenant._count.orders === 1 ? "" : "s"}
                  </Muted>
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
