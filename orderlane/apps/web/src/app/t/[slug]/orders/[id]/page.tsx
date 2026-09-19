import Link from "next/link";

import { availableTransitions, getOrder, transitionHistory } from "@orderlane/services";

import { Badge, Card, Muted, money, stateTone } from "@/components/ui";
import { currentContext } from "@/lib/session";
import { TransitionForm } from "./transition-form";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { ctx } = await currentContext(slug);

  const order = await getOrder(ctx, id);
  const buyer = order.buyer as { name?: string; email?: string };
  const shipTo = order.shipTo as Record<string, string | undefined>;

  const fulfillments = await Promise.all(
    order.fulfillments.map(async (fulfillment) => ({
      fulfillment,
      transitions: await availableTransitions(ctx, fulfillment.workflowInstanceId),
      history: await transitionHistory(ctx, fulfillment.workflowInstanceId),
    })),
  );

  return (
    <main className="wrap">
      <p style={{ marginTop: 0 }}>
        <Link href={`/t/${slug}/orders`}>← Orders</Link>
      </p>
      <h1 style={{ letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>{order.number}</h1>
      <p style={{ marginTop: 0 }}>
        <Muted>
          {order.channel} · placed {order.placedAt.toISOString().slice(0, 10)}
          {order.externalRef ? ` · ${order.externalRef}` : ""}
        </Muted>
      </p>

      <Card style={{ marginTop: "1.5rem", padding: "1rem 1.25rem" }}>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Line</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{line.sku}</td>
                  <td>
                    {line.title}
                    {line.personalization ? (
                      <div>
                        <Muted>
                          {Object.entries(line.personalization as Record<string, unknown>)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(" · ")}
                        </Muted>
                      </div>
                    ) : null}
                  </td>
                  <td>{line.quantity}</td>
                  <td>{money(line.unitPriceMinor, order.currency)}</td>
                  <td>{money(line.unitPriceMinor * line.quantity, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ textAlign: "right", marginBottom: 0 }}>
          <Muted>Subtotal {money(order.subtotalMinor, order.currency)} · shipping{" "}
          {money(order.shippingMinor, order.currency)} · </Muted>
          <strong>{money(order.totalMinor, order.currency)}</strong>
        </p>
      </Card>

      <Card style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
          Ship to
        </h2>
        <p style={{ margin: 0 }}>
          {buyer.name}
          {buyer.email ? <Muted> · {buyer.email}</Muted> : null}
          <br />
          <Muted>
            {[shipTo["line1"], shipTo["line2"], shipTo["city"], shipTo["region"], shipTo["postcode"], shipTo["country"]]
              .filter(Boolean)
              .join(", ")}
          </Muted>
        </p>
      </Card>

      <h2 style={{ marginTop: "2rem", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
        Fulfillment
      </h2>

      {fulfillments.length === 0 ? (
        <Card>
          <Muted>No work has started on this order.</Muted>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {fulfillments.map(({ fulfillment, transitions, history }) => {
            const instance = fulfillment.workflowInstance;
            return (
              <Card key={fulfillment.id}>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                  <Badge tone={stateTone(instance.currentState.key, instance.currentState.kind)}>
                    {instance.currentState.label}
                  </Badge>
                  <Muted>
                    {instance.definition.name} · {fulfillment.lines.length} line
                    {fulfillment.lines.length === 1 ? "" : "s"}
                  </Muted>
                </div>

                <div style={{ marginTop: "1rem" }}>
                  <TransitionForm
                    slug={slug}
                    orderId={order.id}
                    instanceId={instance.id}
                    version={instance.version}
                    transitions={transitions.map((t) => ({ key: t.key, label: t.label }))}
                  />
                </div>

                <details style={{ marginTop: "1rem" }}>
                  <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                    History ({history.length})
                  </summary>
                  <ol style={{ margin: "0.75rem 0 0", paddingLeft: "1.1rem", fontSize: "0.9rem" }}>
                    {history.map((entry) => (
                      <li key={entry.id} style={{ marginBottom: "0.35rem" }}>
                        {entry.fromState.key === entry.toState.key ? (
                          <>Started in <strong>{entry.toState.label}</strong></>
                        ) : (
                          <>
                            {entry.fromState.label} → <strong>{entry.toState.label}</strong>
                          </>
                        )}{" "}
                        <Muted>{entry.at.toISOString().replace("T", " ").slice(0, 16)}</Muted>
                      </li>
                    ))}
                  </ol>
                </details>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
