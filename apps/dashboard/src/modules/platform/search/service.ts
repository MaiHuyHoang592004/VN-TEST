import {
  prisma,
  orderScope,
  productScope,
  can,
  type Prisma,
  type SessionUser,
} from "@gwprint/db";

/** The same explicit-actor shape every other service takes, so the scope can
 * be tested without a request. */
type Actor = SessionUser;

/**
 * The one query behind ⌘K.
 *
 * Two rules it exists to keep:
 *   1. EVERY group is scope-filtered by the same clauses the pages use, so a
 *      seller searching another seller's tracking number finds nothing. The
 *      search box is a back door into every table at once if it isn't.
 *   2. Groups the actor cannot read are not searched at all — users only for
 *      users.read, so a seller never pays for a query whose results would be
 *      dropped anyway.
 *
 * Replaces the demo dataset (lib/search-data.ts) behind the SAME /api/search
 * contract the UI already speaks; only `href` is new, and it exists because
 * the demo guessed routes that never existed.
 */
export type SearchHit = {
  id: string;
  /** Short identifier: order number, SKU, email. */
  code: string;
  name: string;
  type: "order" | "variant" | "user" | "page";
  /** The group heading — status for orders, "variant", "user", "page". */
  category: string;
  /** Where clicking it goes. Server-decided: the client should not be
   * inventing routes for rows it did not build. */
  href: string;
};

/** Static destinations, filtered by what the viewer may open. Cheap, and the
 * thing people most often reach for ⌘K to do. */
const PAGES: Array<{ label: string; href: string; permission?: Parameters<typeof can>[1] }> = [
  { label: "Orders", href: "/orders" },
  { label: "Catalogue", href: "/catalog" },
  { label: "Support tickets", href: "/tickets" },
  { label: "Billing", href: "/profile/billing", permission: "transactions.read.own" },
  { label: "Fulfillment station", href: "/fulfillment", permission: "orders.status.update" },
  { label: "Stock", href: "/inventory", permission: "inventory.read" },
  { label: "Receipts", href: "/inventory/receipts", permission: "inventory.read" },
  { label: "Users", href: "/admin/users", permission: "users.read" },
  { label: "Transactions", href: "/admin/transactions", permission: "transactions.read.all" },
  { label: "Vendors", href: "/admin/vendors", permission: "vendors.manage" },
  { label: "Expenses", href: "/admin/expenses", permission: "expenses.manage" },
  { label: "Warehouses", href: "/admin/warehouses", permission: "warehouses.read" },
  { label: "Audit log", href: "/admin/audit", permission: "audit.read" },
];

/** Per group, so one noisy group cannot crowd the others out. */
const PER_GROUP = 5;

/**
 * Below this, searching costs more than it can possibly be worth.
 *
 * `contains` compiles to ILIKE '%term%', which no btree index can serve — so
 * every query here is a sequential scan whatever the length. One character
 * scans the whole table to return five essentially random rows; two is the
 * shortest input that means anything ("LF" for a SKU prefix, a two-letter
 * name).
 *
 * ponytail: sequential scans are the ceiling of this whole file, not just of
 * short queries. Upgrade path when orders pass ~100k: pg_trgm GIN indexes on
 * the columns matched here (orders.external_id, shipments.tracking_number,
 * product_variants.sku, users.email/name), which makes ILIKE '%x%' indexable —
 * one migration, no code change. See doc 07 §0c.
 */
export const MIN_QUERY_LENGTH = 2;

export async function searchFor(
  actor: Actor,
  query: string,
  limit = 10,
): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];

  const like = { contains: q, mode: "insensitive" as const };

  const pages: SearchHit[] = PAGES.filter(
    (page) => !page.permission || can(actor.roles, page.permission),
  )
    .filter((page) => page.label.toLowerCase().includes(q.toLowerCase()))
    .slice(0, PER_GROUP)
    .map((page) => ({
      id: `page-${page.href}`,
      code: page.href,
      name: page.label,
      type: "page" as const,
      category: "page",
      href: page.href,
    }));

  const orderWhere: Prisma.OrderWhereInput = {
    ...(await orderScope(actor)),
    deletedAt: null,
    OR: [
      { externalId: like },
      { shipments: { some: { trackingNumber: like } } },
      { customer: { is: { name: like } } },
      { customer: { is: { email: like } } },
    ],
  };

  const [orders, variants, users] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        externalId: true,
        status: true,
        customer: { select: { name: true, email: true } },
        variant: { select: { name: true } },
      },
      orderBy: { placedAt: "desc" },
      take: PER_GROUP,
    }),
    prisma.productVariant.findMany({
      where: {
        deletedAt: null,
        // The allow-list a restricted seller is bound to — the same clause the
        // catalogue page spreads.
        product: { is: { ...(await productScope(actor)), deletedAt: null } },
        OR: [
          { sku: like },
          { variant: { is: { name: like } } },
          { variant: { is: { key: like } } },
          { product: { is: { name: like } } },
        ],
      },
      select: {
        id: true,
        sku: true,
        variant: { select: { id: true, name: true } },
        product: { select: { name: true } },
      },
      take: PER_GROUP,
    }),
    can(actor.roles, "users.read")
      ? prisma.user.findMany({
          where: { deletedAt: null, OR: [{ name: like }, { email: like }] },
          select: { id: true, name: true, email: true },
          take: PER_GROUP,
        })
      : Promise.resolve([]),
  ]);

  const hits: SearchHit[] = [
    ...pages,
    ...orders.map((order) => ({
      id: `order-${order.id}`,
      code: order.externalId ?? `#${order.id}`,
      name: [order.variant?.name, order.customer?.name ?? order.customer?.email]
        .filter(Boolean)
        .join(" · ") || `Order ${order.externalId ?? order.id}`,
      type: "order" as const,
      category: order.status.toLowerCase().replace("_", " "),
      // The orders table has no detail route; the search term carries through
      // to the filter, which is where the column actually lives.
      href: `/orders?q=${encodeURIComponent(order.externalId ?? String(order.id))}`,
    })),
    ...variants.map((product) => ({
      id: `variant-${product.id}`,
      code: product.sku ?? `#${product.id}`,
      name: [product.variant?.name, product.product?.name].filter(Boolean).join(" — "),
      type: "variant" as const,
      category: "variant",
      href: `/catalog?q=${encodeURIComponent(product.sku ?? product.variant?.name ?? "")}`,
    })),
    ...users.map((user) => ({
      id: `user-${user.id}`,
      code: user.email,
      name: user.name ?? user.email,
      type: "user" as const,
      category: "user",
      href: `/admin/users?q=${encodeURIComponent(user.email)}`,
    })),
  ];

  return hits.slice(0, limit);
}
