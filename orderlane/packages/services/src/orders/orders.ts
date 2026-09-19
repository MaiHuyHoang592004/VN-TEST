import { checkDeclaredTotals, subtotalMinor, validateAmounts } from "@orderlane/core/orders";
import { Prisma } from "@orderlane/db";
import { z } from "zod";

import { resolveSkus } from "../catalog/products.ts";
import type { Ctx } from "../context.ts";
import { ConflictError, NotFoundError, ValidationError, isUniqueViolation } from "../errors.ts";
import { requireRole } from "../identity/tenants.ts";
import { keysetQuery, toPage, type Page, type PageRequest } from "../keyset.ts";

/**
 * Orders. An order is a commercial document: it records what was agreed and
 * does not move. Where the work has got to lives on its fulfillments, and the
 * state those are in is the workflow engine's business.
 *
 * Note what this module does NOT have: a status update. There is nowhere to
 * put one.
 */

const address = z.object({
  name: z.string().trim().min(1).max(200),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).optional(),
  postcode: z.string().trim().max(32).optional(),
  country: z.string().trim().length(2).toUpperCase(),
});

const buyer = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional(),
});

export const createOrderInput = z.object({
  channel: z.string().trim().min(1).max(64),
  externalRef: z.string().trim().max(120).optional(),
  buyer,
  shipTo: address,
  placedAt: z.coerce.date().optional(),
  shippingMinor: z.number().int().min(0).default(0),
  /** Optional, and checked against the lines rather than trusted. */
  declaredTotals: z
    .object({ subtotalMinor: z.number().int(), shippingMinor: z.number().int(), totalMinor: z.number().int() })
    .optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  lines: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64),
        quantity: z.number().int().min(1),
        /** Falls back to the variant's catalogue price. */
        unitPriceMinor: z.number().int().min(0).optional(),
        /**
         * A flat map of primitives, not arbitrary JSON. Personalisation is a
         * name to engrave, a date, a short message — and constraining it to
         * scalars keeps it renderable, searchable and JSON-safe without
         * inventing a schema for something each product defines differently.
         */
        personalization: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export type CreateOrderInput = z.infer<typeof createOrderInput>;

export async function createOrder(ctx: Ctx, rawInput: unknown) {
  requireRole(ctx, "OPERATOR");

  const parsed = createOrderInput.safeParse(rawInput);
  if (!parsed.success) throw new ValidationError("order input is not valid", parsed.error.issues);
  const input = parsed.data;

  // Resolve every SKU in one query, and report every unknown one at once. A
  // caller fixing a five-SKU typo should not have to submit five times.
  const variants = await resolveSkus(ctx, input.lines.map((l) => l.sku));
  const unknown = input.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => !variants.has(line.sku.trim().toUpperCase()));
  if (unknown.length > 0) {
    throw new ValidationError(
      `${unknown.length} line(s) reference a SKU this catalogue does not have`,
      unknown.map(({ line, index }) => ({ lineIndex: index, sku: line.sku, code: "unknown_sku" })),
    );
  }

  const lines = input.lines.map((line) => {
    const variant = variants.get(line.sku.trim().toUpperCase())!;
    return {
      variantId: variant.id,
      sku: line.sku.trim().toUpperCase(),
      title: variant.title,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor ?? variant.priceMinor,
      // Spread rather than `personalization: undefined`. Prisma distinguishes
      // a JSON null from an absent value, and under exactOptionalPropertyTypes
      // an explicit undefined is not the same as omitting the key.
      ...(line.personalization ? { personalization: line.personalization } : {}),
    };
  });

  const amountIssues = validateAmounts(lines, input.shippingMinor);
  if (amountIssues.length > 0) throw new ValidationError("order amounts are not valid", amountIssues);

  const subtotal = subtotalMinor(lines);
  const total = subtotal + input.shippingMinor;

  if (input.declaredTotals) {
    const mismatches = checkDeclaredTotals(lines, input.declaredTotals);
    if (mismatches.length > 0) {
      throw new ValidationError("declared totals disagree with the lines", mismatches);
    }
  }

  const tenant = await ctx.db.$transaction(async (tx) => {
    // The order number is assigned by the application, not a database
    // sequence, so a merchant can carry a prefix of their own. Computed
    // inside the transaction so two concurrent creates cannot pick the same
    // one — the (tenantId, number) unique is what actually guarantees it.
    const count = await tx.order.count();
    const number = `ORD-${String(count + 1).padStart(5, "0")}`;

    return tx.order.create({
      data: {
        tenantId: ctx.tenantId,
        number,
        channel: input.channel,
        externalRef: input.externalRef ?? null,
        buyer: input.buyer,
        shipTo: input.shipTo,
        currency: (await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { currency: true } })).currency,
        subtotalMinor: subtotal,
        shippingMinor: input.shippingMinor,
        totalMinor: total,
        placedAt: input.placedAt ?? new Date(),
        idempotencyKey: input.idempotencyKey ?? null,
        lines: { create: lines.map((line) => ({ ...line, tenantId: ctx.tenantId })) },
      },
      include: { lines: true },
    });
  }).catch((error: unknown) => {
    // A retried POST carrying the same key must produce one order, and the
    // unique constraint is what makes that true — an application-level "does
    // it exist yet?" check races with its own retry.
    if (isUniqueViolation(error) && input.idempotencyKey) {
      throw new ConflictError(`an order with idempotency key "${input.idempotencyKey}" already exists`, {
        idempotencyKey: input.idempotencyKey,
      });
    }
    throw error;
  });

  return tenant;
}

/**
 * Create, or return the one that already exists for this key.
 *
 * Separate from createOrder because "make me an order" and "make me an order
 * unless you already did" are different intents, and collapsing them hides a
 * duplicate from a caller that wanted to know.
 */
export async function createOrderIdempotent(ctx: Ctx, rawInput: unknown) {
  try {
    return { created: true as const, order: await createOrder(ctx, rawInput) };
  } catch (error) {
    if (error instanceof ConflictError && typeof error.details === "object" && error.details !== null) {
      const key = (error.details as { idempotencyKey?: string }).idempotencyKey;
      if (key) {
        const existing = await ctx.db.order.findFirst({
          where: { idempotencyKey: key },
          include: { lines: true },
        });
        if (existing) return { created: false as const, order: existing };
      }
    }
    throw error;
  }
}

export interface OrderListItem {
  readonly id: string;
  readonly number: string;
  readonly channel: string;
  readonly totalMinor: number;
  readonly currency: string;
  readonly placedAt: Date;
  readonly lineCount: number;
  /** Current workflow state of each fulfillment. Empty until work starts. */
  readonly states: readonly string[];
}

export async function listOrders(ctx: Ctx, request: PageRequest = {}): Promise<Page<OrderListItem>> {
  const { take, where } = keysetQuery(request, "placedAt", "desc");

  const rows = await ctx.db.order.findMany({
    where: { ...where, deletedAt: null },
    orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    take,
    include: {
      _count: { select: { lines: true } },
      fulfillments: { select: { workflowInstance: { select: { currentState: { select: { key: true } } } } } },
    },
  });

  return toPage(
    rows.map((o) => ({
      id: o.id,
      number: o.number,
      channel: o.channel,
      totalMinor: o.totalMinor,
      currency: o.currency,
      placedAt: o.placedAt,
      lineCount: o._count.lines,
      states: o.fulfillments.map((f) => f.workflowInstance.currentState.key),
    })),
    take,
    (row) => row.placedAt,
  );
}

/**
 * The detail view's shape, declared once. `Prisma.OrderGetPayload` derives the
 * return type from the include rather than restating it, so adding a relation
 * to the query cannot drift from the type callers see.
 */
const orderDetailInclude = {
  lines: { include: { variant: { select: { sku: true, title: true } } } },
  fulfillments: {
    include: {
      lines: true,
      workflowInstance: { include: { currentState: true, definition: { select: { key: true, name: true } } } },
      shipments: true,
    },
  },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export async function getOrder(ctx: Ctx, orderId: string): Promise<OrderDetail> {
  const order = await ctx.db.order.findUnique({
    where: { id: orderId },
    include: orderDetailInclude,
  });
  if (!order) throw new NotFoundError("order", orderId);
  return order;
}
