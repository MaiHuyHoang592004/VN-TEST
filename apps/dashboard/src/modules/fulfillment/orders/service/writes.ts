
/**
 * Creating, editing and removing orders.
 *
 * Two rules hold in every function here:
 *   • the SKU decides variant, product and price. Never the client — a forged
 *     productId alongside a real productVariantId would otherwise let a buyer
 *     name their own price.
 *   • an id from a client is not authorization. Every mutation re-reads the
 *     column through the actor's scope before touching it.
 *
 * Transport-agnostic, like the rest of the domain: the web action, the
 * spreadsheet importer and /api/v1 call these same functions with an explicit
 * actor, so a rule cannot hold on one route and be missing on another — which
 * is how the legacy API ended up able to create orders the UI would have
 * rejected.
 */
import { prisma, writeAudit, orderScope, type AuditContext } from "@gwprint/db";
import { can } from "@gwprint/shared";

import { isDuplicateKey } from "../../../core/ledger.ts";
import { notify } from "../../../platform/index.ts";
import { orderSchema, type OrderInput } from "../schema.ts";
import { blankToNull, type Actor } from "./shared.ts";

/**
 * Create one order.
 *
 * `owner` defaults to the actor, which is exactly what legacy did — everyone
 * created orders for themselves and there was no way to name anyone else. It
 * is a PARAMETER rather than an inlined `actor.id` because the importers
 * coming in doc 05 (TikTok, and any marketplace connector) genuinely need to
 * file an order against the seller who owns the shop, and naming someone else
 * costs orders.update.
 */
export async function createOrder(
  actor: Actor,
  raw: unknown,
  ctx: AuditContext,
  owner: string = actor.id,
  idempotencyKey?: string,
) {
  const input = orderSchema.parse(raw);
  if (owner !== actor.id && !can(actor.roles, "orders.update")) {
    return { ok: false as const, error: "cannot-create-for-others" as const };
  }

  // A retried POST must return the SAME order, not make a second one. The fast
  // path saves a doomed insert; the UNIQUE constraint below is what actually
  // holds when two retries arrive at once.
  if (idempotencyKey) {
    const seen = await prisma.order.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (seen) return { ok: true as const, id: seen.id, deduped: true as const };
  }

  // The SKU is the source of truth for what was bought. Reading variant and
  // product off it server-side is what stops a client pairing a cheap SKU with
  // an expensive variant.
  const sku = await prisma.productVariant.findFirst({
    where: { id: input.productVariantId, deletedAt: null },
    select: { id: true, productId: true, variantId: true, status: true },
  });
  if (!sku) return { ok: false as const, error: "unknown-sku" as const };
  if (sku.status !== "ACTIVE") return { ok: false as const, error: "sku-inactive" as const };

  try {
    return await createOrderTx(input, sku, owner, ctx, idempotencyKey);
  } catch (e) {
    // Lost the UNIQUE(idempotencyKey) race: the other attempt created it, so
    // report ITS order rather than failing a caller who did nothing wrong.
    if (isDuplicateKey(e) && idempotencyKey) {
      const winner = await prisma.order.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (winner) return { ok: true as const, id: winner.id, deduped: true as const };
    }
    throw e;
  }
}

async function createOrderTx(
  input: OrderInput,
  sku: { id: number; productId: number; variantId: number },
  owner: string,
  ctx: AuditContext,
  idempotencyKey?: string,
) {
  const order = await prisma.$transaction(async (tx) => {
    const address = await tx.address.create({
      data: {
        name: input.shippingName,
        company: blankToNull(input.shippingCompany),
        email: blankToNull(input.shippingEmail),
        phone: blankToNull(input.shippingPhone),
        line1: blankToNull(input.line1),
        line2: blankToNull(input.line2),
        city: blankToNull(input.city),
        state: blankToNull(input.state),
        zip: input.zip,
        country: blankToNull(input.country),
      },
      select: { id: true },
    });
    const created = await tx.order.create({
      data: {
        externalId: input.externalId,
        marketplace: blankToNull(input.marketplace),
        seller: blankToNull(input.seller),
        source: "app",
        customerId: owner,
        productVariantId: sku.id,
        productId: sku.productId,
        variantId: sku.variantId,
        mockupId: input.mockupId ?? null,
        shippingAddressId: address.id,
        quantity: input.quantity,
        placedAt: input.placedAt,
        deadline: input.deadline ?? null,
        status: "PENDING",
        note: blankToNull(input.note),
        internalNote: blankToNull(input.internalNote),
        imageUrl: blankToNull(input.imageUrl),
        idempotencyKey: idempotencyKey ?? null,
      },
      select: { id: true, externalId: true },
    });
    await writeAudit(tx, ctx, {
      action: "ORDER_CREATED",
      targetType: "order",
      targetId: String(created.id),
      after: { externalId: created.externalId, customerId: owner, quantity: input.quantity },
    });
    // Only when someone ELSE filed it. Telling a seller about the order they
    // just typed is noise, and noise is how people learn to ignore the bell.
    if (owner !== ctx.actor?.id) {
      await notify(tx, {
        userId: owner,
        type: "ORDER_CREATED",
        data: { externalId: created.externalId ?? String(created.id) },
        href: "/orders",
      });
    }
    return created;
  });
  return { ok: true as const, id: order.id, deduped: false as const };
}

/**
 * Create many, reporting per column. One transaction PER ROW, not one for the
 * batch: a spreadsheet with three bad lines should import the good ones and
 * name the bad, which is what the legacy importer did well and the only part
 * of it worth keeping.
 */
export async function createOrders(
  actor: Actor,
  rows: unknown[],
  ctx: AuditContext,
  owner: string = actor.id,
) {
  const results: Array<{ column: number; ok: boolean; id?: number; error?: string }> = [];
  for (const [i, raw] of rows.entries()) {
    try {
      const r = await createOrder(actor, raw, ctx, owner);
      results.push(r.ok ? { column: i, ok: true, id: r.id } : { column: i, ok: false, error: r.error });
    } catch (e) {
      const message =
        e instanceof Error && e.name === "ZodError"
          ? (JSON.parse(e.message) as Array<{ path: string[]; message: string }>)
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ")
          : "Could not be imported";
      results.push({ column: i, ok: false, error: message });
    }
  }
  return {
    ok: true as const,
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function updateOrder(actor: Actor, id: number, raw: unknown, ctx: AuditContext) {
  const input = orderSchema.parse(raw);
  const before = await prisma.order.findFirstOrThrow({
    where: { ...(await orderScope(actor)), id, deletedAt: null },
    select: {
      externalId: true, marketplace: true, quantity: true, deadline: true,
      note: true, internalNote: true, imageUrl: true, shippingAddressId: true,
    },
  });
  const data = {
    externalId: input.externalId,
    marketplace: blankToNull(input.marketplace),
    quantity: input.quantity,
    deadline: input.deadline ?? null,
    note: blankToNull(input.note),
    internalNote: blankToNull(input.internalNote),
    imageUrl: blankToNull(input.imageUrl),
  };
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data });
    if (before.shippingAddressId) {
      await tx.address.update({
        where: { id: before.shippingAddressId },
        data: {
          name: input.shippingName,
          company: blankToNull(input.shippingCompany),
          email: blankToNull(input.shippingEmail),
          phone: blankToNull(input.shippingPhone),
          line1: blankToNull(input.line1),
          line2: blankToNull(input.line2),
          city: blankToNull(input.city),
          state: blankToNull(input.state),
          zip: input.zip,
          country: blankToNull(input.country),
        },
      });
    }
    // Diff only what changed — a whole-column before/after buries the one field
    // someone actually needs to find later.
    const changed = Object.fromEntries(
      Object.entries(data).filter(([k, v]) => String(before[k as keyof typeof before] ?? "") !== String(v ?? "")),
    );
    await writeAudit(tx, ctx, {
      action: "ORDER_UPDATED",
      targetType: "order",
      targetId: String(id),
      before,
      after: changed,
    });
  });
  return { ok: true as const };
}

/** The fields applyStatusChange needs. Read them through the actor's scope
 * before you call it — this function trusts that you already did. */
export async function deleteOrders(actor: Actor, ids: number[], ctx: AuditContext) {
  const scoped = await prisma.order.findMany({
    where: { ...(await orderScope(actor)), id: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  if (!scoped.length) return { ok: true as const, deleted: 0 };
  await prisma.$transaction(async (tx) => {
    await tx.order.updateMany({
      where: { id: { in: scoped.map((o) => o.id) } },
      data: { deletedAt: new Date() },
    });
    for (const o of scoped) {
      await writeAudit(tx, ctx, {
        action: "ORDER_DELETED",
        targetType: "order",
        targetId: String(o.id),
        after: { deleted: true },
      });
    }
  });
  return { ok: true as const, deleted: scoped.length };
}
