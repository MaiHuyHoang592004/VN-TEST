import Link from "next/link";

import { Card, Muted } from "@/components/ui";
import { listTenants } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * A tenant picker stands in for sign-in until auth lands. It is also a fair
 * summary of the product's shape: everything below this point is scoped to one
 * merchant, and the URL says which.
 */
export default async function Home() {
  const tenants = await listTenants();

  return (
    <main className="wrap">
      <h1 style={{ letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>Orderlane</h1>
      <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
        A multi-tenant fulfillment workspace. Catalogue, orders, production and shipping, with a
        fulfillment process each merchant configures rather than inherits.
      </p>

      {tenants.length === 0 ? (
        <Card style={{ marginTop: "2rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>No data yet</h2>
          <p style={{ marginBottom: 0 }}>
            <Muted>
              Run <code>npm run db:seed</code> to create two demo merchants with synthetic orders.
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
                <Muted>
                  {tenant._count.orders} order{tenant._count.orders === 1 ? "" : "s"}
                </Muted>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
