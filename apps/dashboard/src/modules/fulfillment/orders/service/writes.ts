
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
import { notify, dispatchWebhook } from "../../../platform/index.ts";
import { importIdempotencyKey } from "../import-key.ts";
import { orderSchema, type OrderInput } from "../schema.ts";
import { editableAt } from "../status.ts";
import { blankToNull, resumeTargetOf, type Actor } from "./shared.ts";

/** A stale write must lose the race, not silently win it. Thrown when a
 * caller supplied the `updatedAt` it read and the row has since moved. */
export class OrderConflictError extends Error {
  readonly code = "conflict" as const;
  readonly orderId: number;
  // Fields assigned explicitly, not via TypeScript parameter properties:
  // node --test strips types rather than compiling them (modules/README.md).
  constructor(orderId: number) {
    super(`Order ${orderId} was changed since it was read.`);
    this.name = "OrderConflictError";
    this.orderId = orderId;
  }
}

/**
 * Create one order.
 *
 * `owner` defaults to the actor, which is exactly what legacy did — everyone
 * created orders for themselves and there was no way to name anyone else. It
 * is a PARAMETER rather than an inlined `actor.id` because the importers
 * coming in doc 05 (TikTok, and any marketplace connector) genuinely need to
 * file an order against the seller who owns the shop, and naming someone else
 * costs orders.create.any.
 *
 * That check USED to read orders.update, which was safe only for as long as
 * ADMIN was the only role holding it. Once support and sellers gained an edit
 * right, "may correct an order" and "may bill another seller's wallet" would
 * have become the same grant, and every seller could have filed orders against
 * every other seller. The two acts now have two names.
 */
export async function createOrder(
  actor: Actor,
  raw: unknown,
  ctx: AuditContext,
  owner: string = actor.id,
  idempotencyKey?: string,
  /** false for createOrders' per-row loop, which dispatches CONCURRENTLY for
   * the whole batch afterward instead — sequentially awaiting one webhook
   * call (each up to 3 attempts with backoff) per imported row would make a
   * large import as slow as the seller's endpoint is unreliable. */
  notifyWebhook = true,
) {
  const input = orderSchema.parse(raw);
  if (owner !== actor.id && !can(actor.roles, "orders.create.any")) {
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
    const result = await createOrderTx(input, sku, owner, ctx, idempotencyKey);
    // AFTER the transaction commits, never inside — same rule as every other
    // webhook dispatch in this codebase. Never on a deduped retry: the
    // seller already heard about this order the first time it was created.
    if (notifyWebhook && !result.deduped) {
      await dispatchWebhook(owner, "order_created", {
        id: result.id,
        order_id: input.externalId,
        quantity: input.quantity,
        placed_at: input.placedAt.toISOString(),
      });
    }
    return result;
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
  /**
   * Với mỗi dòng, lần xuất hiện thứ mấy của nội dung đó TRONG FILE của seller.
   * Client tính trên toàn bộ file đã parse (xem contentOrdinals) và gửi kèm, vì
   * server chỉ thấy một lô 50 dòng và không tự đếm được.
   *
   * Thiếu thì lùi về `i + 1` — /api/v1 gửi một mảng độc lập, ở đó vị trí trong
   * mảng CHÍNH LÀ vị trí trong file.
   */
  ordinals?: number[],
) {
  const results: Array<{ column: number; ok: boolean; id?: number; deduped?: boolean; error?: string }> = [];
  for (const [i, raw] of rows.entries()) {
    try {
      // Khoá dẫn từ NỘI DUNG dòng cộng thứ tự xuất hiện của nội dung đó trong
      // file — không phải vị trí trong payload. Vị trí đổi bất cứ khi nào tập
      // dòng bị bỏ qua thay đổi (dòng không tra được SKU bị lọc ở client, rồi
      // cắt lô 50), nên sửa một dòng rồi upload lại từng làm xê dịch khoá của
      // mọi dòng sau nó và tạo đơn trùng ĐƯỢC BÁO LÀ THÀNH CÔNG.
      //
      // Hai dòng thật sự giống hệt nhau (đơn tách món) vẫn tạo hai đơn: chúng
      // nhận ordinal 1 và 2.
      const idempotencyKey = importIdempotencyKey(owner, raw, ordinals?.[i] ?? i + 1);
      const r = await createOrder(actor, raw, ctx, owner, idempotencyKey, false);
      results.push(
        r.ok
          ? { column: i, ok: true, id: r.id, deduped: r.deduped }
          : { column: i, ok: false, error: r.error },
      );
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

  // One event per genuinely NEW row, fired CONCURRENTLY after the loop — see
  // createOrder's notifyWebhook doc-comment for why not per-row inline.
  await Promise.all(
    results
      .filter((r) => r.ok && !r.deduped)
      .map((r) =>
        dispatchWebhook(owner, "order_created", {
          id: r.id,
          order_id: (rows[r.column] as { externalId?: string })?.externalId,
        }),
      ),
  );

  return {
    ok: true as const,
    created: results.filter((r) => r.ok).length,
    /** Trong số `created`, bao nhiêu dòng chỉ khớp lại đơn đã có. UI phải phân
     * biệt được, nếu không một lần upload lại sẽ báo "137 đơn mới" khi không tạo
     * gì cả. */
    deduped: results.filter((r) => r.ok && r.deduped).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

/**
 * Edit an order's fields.
 *
 * TWO gates, and they answer different questions. This one asks WHEN: an order
 * may be edited only while nobody has started making it, and a seller's window
 * closes a step earlier than staff's (editableAt, orders/status.ts). The
 * per-field locks below ask WHAT: quantity is money that has already moved, so
 * it stops being editable the moment the order leaves PENDING even for an
 * admin who may still edit everything else.
 *
 * The caller has already proved it holds one of the two edit permissions; this
 * function decides which window that buys. `orders.update` is staff reach,
 * `orders.update.own` is the seller's — and "own" itself is enforced by
 * orderScope on the read below, not by trusting the caller.
 */
export async function updateOrder(
  actor: Actor,
  id: number,
  raw: unknown,
  ctx: AuditContext,
  /** The `updatedAt` the caller read before editing. Omit to skip the check —
   * no dashboard screen currently opens an existing order for edit, so no
   * caller has one to send yet; this is here for when one does. */
  expectedUpdatedAt?: Date,
) {
  const input = orderSchema.parse(raw);
  const before = await prisma.order.findFirstOrThrow({
    where: { ...(await orderScope(actor)), id, deletedAt: null },
    select: {
      externalId: true, marketplace: true, quantity: true, deadline: true,
      note: true, internalNote: true, imageUrl: true, shippingAddressId: true,
      status: true, configs: true,
    },
  });

  // The window. A refusal here is about the ORDER's progress, not about the
  // actor's rights — they held a write permission or they would not have got
  // this far — so it is a distinct code from the field locks below and the UI
  // says "too late", not "not allowed".
  if (
    !editableAt(
      before.status,
      can(actor.roles, "orders.update"),
      resumeTargetOf(before.configs),
    )
  ) {
    return { ok: false as const, error: "too-late" as const };
  }

  // Quantity is the one field that changes what somebody has to MAKE — once
  // the order has left PENDING it has already been priced and charged (see
  // assignOrders), so changing it here would desync Order.quantity from the
  // baseCost/Transaction already recorded. Matches the public API's
  // patchOrder, which locks the same field the same way.
  if (input.quantity !== before.quantity && before.status !== "PENDING") {
    return { ok: false as const, error: "quantity-locked" as const };
  }
  // Once CANCELLED, only what the public API's patchOrder already treats as
  // safe (note/deadline/imageUrl/externalId/shipping) may still change —
  // informational fields are locked alongside quantity, matching
  // EDITABLE_AFTER_PENDING there, so a closed order does not keep collecting
  // silent edits from whichever surface someone happens to use.
  if (before.status === "CANCELLED") {
    const marketplaceChanged = blankToNull(input.marketplace) !== before.marketplace;
    const internalNoteChanged = blankToNull(input.internalNote) !== before.internalNote;
    if (marketplaceChanged || internalNoteChanged) {
      return { ok: false as const, error: "not-editable" as const };
    }
  }

  const data = {
    externalId: input.externalId,
    marketplace: blankToNull(input.marketplace),
    quantity: input.quantity,
    deadline: input.deadline ?? null,
    note: blankToNull(input.note),
    internalNote: blankToNull(input.internalNote),
    imageUrl: blankToNull(input.imageUrl),
  };
  try {
    await prisma.$transaction(async (tx) => {
      // A caller that supplies the updatedAt it read proves it started from
      // the CURRENT row: if the row has moved since, this matches zero rows
      // and the stale write loses instead of silently clobbering whatever the
      // other party saved in between.
      if (expectedUpdatedAt) {
        const result = await tx.order.updateMany({
          where: { id, updatedAt: expectedUpdatedAt },
          data,
        });
        if (result.count === 0) throw new OrderConflictError(id);
      } else {
        await tx.order.update({ where: { id }, data });
      }
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
        Object.entries(data).filter(
          ([k, v]) => String(before[k as keyof typeof before] ?? "") !== String(v ?? ""),
        ),
      );
      await writeAudit(tx, ctx, {
        action: "ORDER_UPDATED",
        targetType: "order",
        targetId: String(id),
        before,
        after: changed,
      });
    });
  } catch (e) {
    if (e instanceof OrderConflictError) return { ok: false as const, error: "conflict" as const };
    throw e;
  }
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
