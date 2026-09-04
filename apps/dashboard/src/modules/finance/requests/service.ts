/**
 * The half of the money workflow legacy sellers had and doc 04 left out: a
 * seller ASKING for money to move, with evidence attached.
 *
 * Nothing here touches a balance. Every function creates a PENDING Transaction
 * and stops; the approve/reject flow built in doc 04 C1
 * (settlePendingTransaction) is what makes it real, which is why a request can
 * never credit anyone even if this file is wrong. That separation is the whole
 * design: the seller's claim and the money move are two different acts by two
 * different people.
 */
import {
  prisma,
  Prisma,
  type AuditContext,
} from "@gwprint/db";

import { assertImageBatch, storeImages } from "../../core/storage.ts";
import { notifyMany, usersWithPermission } from "../../platform/index.ts";
import { refundQuote } from "../../fulfillment/index.ts";
import { refundRequestSchema, topUpRequestSchema } from "./schema.ts";

type Actor = NonNullable<AuditContext["actor"]>;

export type RequestErrorCode =
  /** Every order named is cancelled, unpaid, or already refunded. */
  | "nothing-refundable"
  /** A PENDING refund request already covers one of these orders. */
  | "duplicate-request"
  /** The amount asked for is more than the orders are worth. */
  | "over-cap";

export class RequestError extends Error {
  readonly code: RequestErrorCode;
  readonly detail?: unknown;
  // Fields assigned explicitly, not via parameter properties: node --test
  // strips types rather than compiling them (modules/README.md).
  constructor(code: RequestErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "RequestError";
    this.code = code;
    this.detail = detail;
  }
}

/** Evidence lands under the transaction's PUBLIC id — the same id Stripe
 * metadata carries — so a bucket listing lines up with what finance searches. */
const evidencePrefix = (publicId: string) => `transactions/${publicId}/`;

/** Tell everyone who could approve this. The audience comes from the same
 * ROLE_PERMISSIONS table the guard reads, so a new role that can approve is
 * included without editing this line. */
async function notifyApprovers(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: { kind: "top-up" | "refund"; amount: Prisma.Decimal },
) {
  const approvers = (await usersWithPermission("transactions.approve")).filter(
    (id) => id !== actor.id,
  );
  await notifyMany(tx, approvers, {
    type: "TRANSACTION_REQUESTED",
    // ponytail: the KIND is an English word inside a localised sentence — the
    // same shortcut the order notifications take with their status. Upgrade
    // path: give the bell a values-are-translation-keys convention, once more
    // than two notifications need it.
    data: {
      kind: input.kind,
      amount: input.amount.toFixed(2),
      from: actor.name ?? actor.email ?? "A seller",
    },
    href: "/admin/transactions?status=PENDING",
  });
}

/**
 * "I have sent you money, please credit my balance."
 *
 * Creates the PENDING column an admin approves later. No balance change here —
 * settlePendingTransaction does that, exactly once, under a compare-and-set.
 */
export async function requestTopUp(actor: Actor, raw: unknown, files: File[] = []) {
  const input = topUpRequestSchema.parse(raw);
  // Before the column: a rejected screenshot must not leave a pending claim behind.
  assertImageBatch(files);
  const amount = new Prisma.Decimal(input.amount);

  const created = await prisma.transaction.create({
    data: {
      userId: actor.id,
      amount,
      type: "TOPUP",
      status: "PENDING",
      paymentMethod: input.method,
      note: input.note || null,
      description: "Seller top-up request",
    },
    select: { id: true, publicId: true },
  });

  // Uploaded after the column exists so the key can name it — a file with no column
  // is an orphan in the bucket, a column with no file is a request an admin can
  // ask about.
  if (files.length) {
    const stored = await storeImages(files, {
      prefix: evidencePrefix(created.publicId),
      uploadedById: actor.id,
    });
    await prisma.transaction.update({
      where: { id: created.id },
      data: { evidence: stored as never },
    });
  }

  await prisma.$transaction((tx) => notifyApprovers(tx, actor, { kind: "top-up", amount }));
  return { ok: true as const, id: created.id, publicId: created.publicId };
}

/**
 * "These orders went wrong, please give the money back."
 *
 * Ports legacy's guards exactly (transaction.service.ts:148-345) and adds the
 * one it was missing: the amount is CAPPED at what the orders are actually
 * worth, computed by fulfillment's refundQuote rather than by a second sum
 * here. Legacy accepted whatever number the form posted.
 */
export async function requestRefund(actor: Actor, raw: unknown, files: File[] = []) {
  const input = refundRequestSchema.parse(raw);
  assertImageBatch(files);

  // The quote runs through the ACTOR's order scope, so ids belonging to another
  // seller simply are not there — an id from a client proves nothing.
  const quote = await refundQuote(actor, input.orderIds);
  const refundable = quote.lines.filter((l) => !l.blocked);
  if (!refundable.length) {
    throw new RequestError("nothing-refundable", "None of those orders can be refunded.", {
      blocked: quote.lines.map((l) => ({ orderId: l.orderId, blocked: l.blocked })),
    });
  }

  // One open request per order. Without this a seller could file five requests
  // for the same parcel and an admin approving them all pays five times —
  // exactly the hole legacy left.
  const orderIds = refundable.map((l) => l.orderId);
  const pending = await prisma.transaction.findMany({
    where: {
      userId: actor.id,
      type: "REFUND",
      status: "PENDING",
      OR: orderIds.map((id) => ({ metadata: { path: ["orderIds"], array_contains: id } })),
    },
    select: { id: true, metadata: true },
  });
  if (pending.length) {
    const claimed = new Set<number>();
    for (const column of pending) {
      const ids = (column.metadata as { orderIds?: unknown } | null)?.orderIds;
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === "number") claimed.add(id);
    }
    throw new RequestError("duplicate-request", "A refund request for that order is already open.", {
      orderIds: orderIds.filter((id) => claimed.has(id)),
    });
  }

  const cap = new Prisma.Decimal(quote.total);
  const amount = input.amount ? new Prisma.Decimal(input.amount) : cap;
  if (amount.greaterThan(cap)) {
    throw new RequestError("over-cap", "That is more than those orders are worth.", {
      cap: cap.toFixed(2),
    });
  }

  const created = await prisma.transaction.create({
    data: {
      userId: actor.id,
      amount,
      type: "REFUND",
      status: "PENDING",
      note: input.reason,
      description: "Seller refund request",
      metadata: { orderIds, reason: input.reason },
    },
    select: { id: true, publicId: true },
  });

  if (files.length) {
    const stored = await storeImages(files, {
      prefix: evidencePrefix(created.publicId),
      uploadedById: actor.id,
    });
    await prisma.transaction.update({
      where: { id: created.id },
      data: { evidence: stored as never },
    });
  }

  await prisma.$transaction((tx) => notifyApprovers(tx, actor, { kind: "refund", amount }));
  return {
    ok: true as const,
    id: created.id,
    publicId: created.publicId,
    amount: amount.toFixed(2),
    orderIds,
  };
}
