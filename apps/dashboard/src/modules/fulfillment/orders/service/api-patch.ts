/**
 * The public API's partial update — legacy's PATCH /api/warehouse/orders/:id,
 * plus the two "resolve" endpoints it kept separate.
 *
 * Legacy had THREE routes for this: patch, resolve-design and resolve-label.
 * All three did the same thing from a seller's point of view — "here is the
 * missing piece, put my order back in the queue" — so here there is one, and
 * WHAT you send decides which. A design URL on a held order releases it; a
 * label goes through doc 05's linkLabel (the route composes that, because only
 * fulfillment's stations own shipments).
 *
 * PATCH is idempotent by construction: it sets fields to the values you send,
 * so replaying the same body lands on the same state. That is why an
 * Idempotency-Key is accepted and not required here, unlike POST /orders where
 * a lost response means a possible duplicate ORDER.
 */
import {
  prisma,
  writeAudit,
  orderScope,
  type AuditContext,
} from '@gwprint/db';
import { z } from 'zod';

import { applyStatusChange } from './status-change.ts';
import { resumeTargetOf, type Actor } from './shared.ts';

export type PatchErrorCode =
  | 'not-found'
  /** Editing something only a PENDING order may change. */
  | 'not-editable'
  /** A body with nothing in it we accept. */
  | 'nothing-to-patch';

export class PatchError extends Error {
  readonly code: PatchErrorCode;
  // Fields assigned explicitly, not via parameter properties: node --test
  // strips types rather than compiling them (modules/README.md).
  constructor(code: PatchErrorCode, message: string) {
    super(message);
    this.name = 'PatchError';
    this.code = code;
  }
}

/**
 * Snake_case on the wire, camelCase inside — the same convention the GET
 * serializer follows. Every field optional: this is a PATCH, and "absent"
 * has to mean "leave it alone" rather than "clear it".
 */
export const patchOrderSchema = z
  .object({
    note: z.string().trim().max(1000).nullish(),
    quantity: z.number().int().positive().max(10_000).optional(),
    /** ≙ legacy resolve-design. Setting it on a held order releases it. */
    image_url: z.string().trim().url().max(1000).optional(),
    external_id: z.string().trim().max(120).optional(),
    deadline: z.string().trim().datetime().optional(),
    shipping: z
      .object({
        name: z.string().trim().max(160).optional(),
        company: z.string().trim().max(160).nullish(),
        email: z.string().trim().email().max(200).nullish(),
        phone: z.string().trim().max(40).nullish(),
        line1: z.string().trim().max(200).optional(),
        line2: z.string().trim().max(200).nullish(),
        city: z.string().trim().max(120).optional(),
        state: z.string().trim().max(120).nullish(),
        zip: z.string().trim().max(20).optional(),
        country: z.string().trim().max(120).optional(),
      })
      .optional(),
  })
  // Strict: a typo'd field name is an error an integrator can see, not a
  // silent no-op that reads back as "the body had no fields".
  .strict();
export type PatchOrderInput = z.infer<typeof patchOrderSchema>;

/** Quantity is the only field that changes what somebody has to MAKE, so it
 * is the only one locked after assignment. */
const EDITABLE_AFTER_PENDING = [
  'note',
  'image_url',
  'external_id',
  'deadline',
  'shipping',
] as const;

export async function patchOrder(
  actor: Actor,
  id: number,
  raw: unknown,
  ctx: AuditContext,
) {
  const input = patchOrderSchema.parse(raw);
  const keys = Object.keys(input).filter(
    (k) => input[k as keyof PatchOrderInput] !== undefined,
  );
  if (!keys.length)
    throw new PatchError(
      'nothing-to-patch',
      'The body had no fields to update.',
    );

  // Scope first: an id from a client proves nothing, and a miss is a 404 so
  // the API never confirms that someone else's order exists.
  const order = await prisma.order.findFirst({
    where: { ...(await orderScope(actor)), id, deletedAt: null },
    select: {
      id: true,
      status: true,
      configs: true,
      customerId: true,
      externalId: true,
      note: true,
      quantity: true,
      imageUrl: true,
      shippingAddressId: true,
    },
  });
  if (!order) throw new PatchError('not-found', 'No such order.');

  if (input.quantity !== undefined && order.status !== 'PENDING') {
    throw new PatchError(
      'not-editable',
      'Quantity can only change while the order is still pending.',
    );
  }
  if (
    order.status === 'CANCELLED' &&
    keys.some((k) => !EDITABLE_AFTER_PENDING.includes(k as never))
  ) {
    throw new PatchError('not-editable', 'That order is cancelled.');
  }

  // ≙ resolve-design: a design arriving on a held order is the thing the hold
  // was waiting for, so the order goes back to where it came from. resumeTo is
  // whatever applyStatusChange stored when it was held; PENDING is the floor.
  const releases = Boolean(input.image_url) && order.status === 'ON_HOLD';
  const resumeTo = resumeTargetOf(order.configs) ?? 'PENDING';

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id },
      data: {
        ...(input.note !== undefined ? { note: input.note || null } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.image_url !== undefined ? { imageUrl: input.image_url } : {}),
        ...(input.external_id !== undefined
          ? { externalId: input.external_id }
          : {}),
        ...(input.deadline !== undefined
          ? { deadline: new Date(input.deadline) }
          : {}),
      },
    });

    if (input.shipping && order.shippingAddressId) {
      const s = input.shipping;
      await tx.address.update({
        where: { id: order.shippingAddressId },
        data: {
          ...(s.name !== undefined ? { name: s.name } : {}),
          ...(s.company !== undefined ? { company: s.company ?? null } : {}),
          ...(s.email !== undefined ? { email: s.email ?? null } : {}),
          ...(s.phone !== undefined ? { phone: s.phone ?? null } : {}),
          ...(s.line1 !== undefined ? { line1: s.line1 } : {}),
          ...(s.line2 !== undefined ? { line2: s.line2 ?? null } : {}),
          ...(s.city !== undefined ? { city: s.city } : {}),
          ...(s.state !== undefined ? { state: s.state ?? null } : {}),
          ...(s.zip !== undefined ? { zip: s.zip } : {}),
          ...(s.country !== undefined ? { country: s.country } : {}),
        },
      });
    }

    await writeAudit(tx, ctx, {
      action: 'ORDER_UPDATED',
      targetType: 'order',
      targetId: String(id),
      before: {
        note: order.note,
        quantity: order.quantity,
        imageUrl: order.imageUrl,
      },
      after: { fields: keys },
      reason: 'api',
    });

    // Through the status core, not a bare update: releasing a hold has to run
    // the same map, audit and seller notification every other move does.
    if (releases) {
      await applyStatusChange(tx, ctx, order, resumeTo, 'design supplied');
    }
  });

  return {
    ok: true as const,
    released: releases,
    resumedTo: releases ? resumeTo : null,
  };
}
