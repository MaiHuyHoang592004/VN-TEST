import Link from "next/link";

import { listOrders } from "@orderlane/services";

import { Badge, Card, Muted, money, stateTone } from "@/components/ui";
import { currentContext } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The order list.
 *
 * Note the `states` column: an order has no status of its own, so this shows
 * the current state of each of its fulfillments. An order split across two
 * parcels shows two, which is the honest answer and the one a single status
 * column could not give.
 */
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { slug } = await params;
  const { cursor } = await searchParams;
  const { tenant, ctx } = await currentContext(slug);

  const page = await listOrders(ctx, { limit: 25, cursor: cursor ?? null });

  return (
    <main className="wrap">
      <p style={{ marginTop: 0 }}>
        <Link href="/">← All merchants</Link>
      </p>
      <h1 style={{ letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>{tenant.name}</h1>
      <p style={{ marginTop: 0 }}>
        <Muted>Orders · signed in as {ctx.actor.role.toLowerCase()}</Muted>
      </p>

      <Card style={{ marginTop: "1.5rem", padding: "1rem 1.25rem" }}>
        {page.items.length === 0 ? (
          <Muted>No orders yet.</Muted>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Placed</th>
                  <th>Channel</th>
                  <th>Lines</th>
                  <th>Total</th>
                  <th>Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/t/${slug}/orders/${order.id}`}>{order.number}</Link>
                    </td>
                    <td>
                      <Muted>{order.placedAt.toISOString().slice(0, 10)}</Muted>
                    </td>
                    <td>{order.channel}</td>
                    <td>{order.lineCount}</td>
                    <td>{money(order.totalMinor, order.currency)}</td>
                    <td>
                      {order.states.length === 0 ? (
                        <Muted>not started</Muted>
                      ) : (
                        <span style={{ display: "inline-flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          {order.states.map((state, i) => (
                            <Badge key={`${state}-${i}`} tone={stateTone(state)}>
                              {state.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {page.hasMore ? (
        <p style={{ marginTop: "1rem" }}>
          <Link href={`/t/${slug}/orders?cursor=${encodeURIComponent(page.nextCursor ?? "")}`}>
            Next page →
          </Link>
        </p>
      ) : null}
    </main>
  );
}
