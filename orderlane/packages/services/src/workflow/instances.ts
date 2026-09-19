import { Workflow, type SubjectFacts, type WorkflowTransition } from "@orderlane/core/workflow";

import { Prisma } from "@orderlane/db";

import type { Ctx } from "../context.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.ts";
import { requireRole } from "../identity/tenants.ts";
import { activeDefinition, loadDefinition, type LoadedDefinition } from "./definitions.ts";

/**
 * Running workflow instances.
 *
 * The decision of whether a move is legal belongs to @orderlane/core and is
 * pure. This module does the two things that decision cannot do for itself:
 * gather the facts the guards ask about, and write the outcome down without
 * losing a race.
 */

export interface StartFulfillmentInput {
  readonly orderId: string;
  /** How much of each order line this parcel covers. */
  readonly lines: readonly { orderLineId: string; quantity: number }[];
  readonly locationId?: string | undefined;
  /** Defaults to the tenant's active process. */
  readonly workflowKey?: string | undefined;
}

export async function startFulfillment(ctx: Ctx, input: StartFulfillmentInput): Promise<{ fulfillmentId: string; instanceId: string; stateKey: string }> {
  requireRole(ctx, "OPERATOR");

  const loaded = await activeDefinition(ctx, input.workflowKey ?? "standard-retail");
  const initial = loaded.definition.states.find((s) => s.kind === "INITIAL");
  if (!initial) throw new ValidationError(`workflow "${loaded.definition.key}" has no initial state`);
  const initialStateId = loaded.stateIdByKey.get(initial.key)!;

  if (input.lines.length === 0) throw new ValidationError("a fulfillment needs at least one line");

  return ctx.db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { lines: { include: { fulfillmentLines: true } } },
    });
    if (!order) throw new NotFoundError("order", input.orderId);

    // A parcel cannot contain more of a line than was ordered. Checked inside
    // the transaction, against rows read inside it — outside, two concurrent
    // splits could each see room that only one of them has.
    const issues: { orderLineId: string; code: string; message: string }[] = [];
    for (const requested of input.lines) {
      const line = order.lines.find((l) => l.id === requested.orderLineId);
      if (!line) {
        issues.push({ orderLineId: requested.orderLineId, code: "unknown_line", message: "not a line of this order" });
        continue;
      }
      if (!Number.isInteger(requested.quantity) || requested.quantity < 1) {
        issues.push({ orderLineId: requested.orderLineId, code: "invalid_quantity", message: `quantity ${requested.quantity} must be a positive integer` });
        continue;
      }
      const alreadyCovered = line.fulfillmentLines.reduce((sum, fl) => sum + fl.quantity, 0);
      if (alreadyCovered + requested.quantity > line.quantity) {
        issues.push({
          orderLineId: requested.orderLineId,
          code: "over_fulfilled",
          message: `ordered ${line.quantity}, already covered ${alreadyCovered}, asked for ${requested.quantity} more`,
        });
      }
    }
    if (issues.length > 0) throw new ValidationError("fulfillment lines are not valid", issues);

    const instance = await tx.workflowInstance.create({
      data: {
        tenantId: ctx.tenantId,
        definitionId: loaded.id,
        currentStateId: initialStateId,
      },
    });

    const fulfillment = await tx.fulfillment.create({
      data: {
        tenantId: ctx.tenantId,
        orderId: input.orderId,
        workflowInstanceId: instance.id,
        ...(input.locationId ? { locationId: input.locationId } : {}),
        lines: { create: input.lines.map((l) => ({ orderLineId: l.orderLineId, quantity: l.quantity })) },
      },
    });

    // The instance's birth is a log entry too. from === to is not a transition
    // the definition allows; it is the record that work started here, and
    // without it the log's first entry would have no "from" to be honest about.
    await tx.transitionLog.create({
      data: {
        instanceId: instance.id,
        fromStateId: initialStateId,
        toStateId: initialStateId,
        actorKind: ctx.actor.kind,
        ...(ctx.actor.id ? { actorId: ctx.actor.id } : {}),
        payload: { event: "started", fulfillmentId: fulfillment.id },
      },
    });

    return { fulfillmentId: fulfillment.id, instanceId: instance.id, stateKey: initial.key };
  });
}

interface LoadedInstance {
  readonly id: string;
  readonly version: number;
  readonly currentStateKey: string;
  readonly currentStateId: string;
  readonly loaded: LoadedDefinition;
  readonly fulfillmentId: string | null;
}

async function loadInstance(ctx: Ctx, instanceId: string): Promise<LoadedInstance> {
  const row = await ctx.db.workflowInstance.findUnique({
    where: { id: instanceId },
    include: { currentState: true, fulfillment: { select: { id: true } } },
  });
  if (!row) throw new NotFoundError("workflow instance", instanceId);

  return {
    id: row.id,
    version: row.version,
    currentStateKey: row.currentState.key,
    currentStateId: row.currentStateId,
    loaded: await loadDefinition(ctx, row.definitionId),
    fulfillmentId: row.fulfillment?.id ?? null,
  };
}

/**
 * The facts the guards ask about.
 *
 * This is the only place in the system that knows both what a guard name means
 * and what an order looks like. The engine stays domain-free because this
 * function exists; a merchant adding a guard adds a fact here, not a branch in
 * @orderlane/core.
 */
export async function factsForFulfillment(ctx: Ctx, fulfillmentId: string): Promise<SubjectFacts> {
  const fulfillment = await ctx.db.fulfillment.findUnique({
    where: { id: fulfillmentId },
    include: {
      lines: { include: { orderLine: { select: { artworkAssetId: true, variantId: true, quantity: true } } } },
      shipments: { select: { labelAssetId: true, trackingNumber: true } },
    },
  });
  if (!fulfillment) throw new NotFoundError("fulfillment", fulfillmentId);

  const linesMissingArtwork = fulfillment.lines.filter((l) => l.orderLine.artworkAssetId === null).length;

  // Stock is only knowable when the work has a location. With none, the count
  // is 0 — "we cannot tell" must not read as "we are short", or a guard would
  // block every fulfillment that has not been assigned a site yet.
  let linesMissingStock = 0;
  if (fulfillment.locationId) {
    const variantIds = fulfillment.lines.map((l) => l.orderLine.variantId).filter((v): v is string => v !== null);
    const stock = await ctx.db.stockItem.findMany({
      where: { locationId: fulfillment.locationId, variantId: { in: variantIds } },
      select: { variantId: true, onHand: true, reserved: true },
    });
    const available = new Map(stock.map((s) => [s.variantId, s.onHand - s.reserved]));
    linesMissingStock = fulfillment.lines.filter((l) => {
      if (!l.orderLine.variantId) return false;
      return (available.get(l.orderLine.variantId) ?? 0) < l.quantity;
    }).length;
  }

  return {
    flags: {
      has_shipping_label: fulfillment.shipments.some((s) => s.labelAssetId !== null || s.trackingNumber !== null),
      has_location: fulfillment.locationId !== null,
    },
    counts: {
      lines_missing_artwork: linesMissingArtwork,
      lines_missing_stock: linesMissingStock,
      lines: fulfillment.lines.length,
      shipments: fulfillment.shipments.length,
    },
  };
}

const NO_FACTS: SubjectFacts = { flags: {}, counts: {} };

export async function availableTransitions(ctx: Ctx, instanceId: string): Promise<readonly WorkflowTransition[]> {
  const instance = await loadInstance(ctx, instanceId);
  const facts = instance.fulfillmentId ? await factsForFulfillment(ctx, instance.fulfillmentId) : NO_FACTS;
  return new Workflow(instance.loaded.definition).available(instance.currentStateKey, ctx.actor, { facts });
}

export interface ApplyTransitionOptions {
  /**
   * The version the caller believes it is acting on, usually the one it
   * rendered. Supplying it turns "somebody else moved this while I was
   * deciding" from a silent overwrite into a conflict the user is told about.
   */
  readonly expectedVersion?: number | undefined;
  readonly note?: string | undefined;
}

export interface TransitionOutcome {
  readonly instanceId: string;
  readonly fromStateKey: string;
  readonly toStateKey: string;
  readonly version: number;
}

/**
 * Take a transition.
 *
 * The decision is pure and happens first; the write is guarded by an
 * optimistic lock. Two operators pressing the same button at the same moment
 * must produce one state change and one log entry, and the loser must be told
 * to reload rather than quietly winning a second time.
 */
export async function applyTransition(
  ctx: Ctx,
  instanceId: string,
  transitionKey: string,
  options: ApplyTransitionOptions = {},
): Promise<TransitionOutcome> {
  const instance = await loadInstance(ctx, instanceId);

  if (options.expectedVersion !== undefined && options.expectedVersion !== instance.version) {
    throw new ConflictError(
      `this work has moved since you looked at it (expected version ${options.expectedVersion}, found ${instance.version})`,
      { expectedVersion: options.expectedVersion, actualVersion: instance.version },
    );
  }

  const facts = instance.fulfillmentId ? await factsForFulfillment(ctx, instance.fulfillmentId) : NO_FACTS;
  const decision = new Workflow(instance.loaded.definition).attempt(
    instance.currentStateKey,
    transitionKey,
    ctx.actor,
    { facts },
  );

  if (!decision.ok) {
    // The engine's error codes map onto two different answers for the caller:
    // "you may not" and "not from here / not with these facts".
    if (decision.error.code === "insufficient_role") {
      throw new ForbiddenError(decision.error.message, decision.error);
    }
    throw new ValidationError(decision.error.message, decision.error);
  }

  const toStateId = instance.loaded.stateIdByKey.get(decision.to.key)!;
  const transitionId = instance.loaded.transitionIdByKey.get(decision.transition.key) ?? null;

  return ctx.db.$transaction(async (tx) => {
    // updateMany, not update: matching on the version is the lock, and
    // updateMany reports how many rows it matched. `update` would either
    // throw or succeed, and neither tells us we lost a race.
    const updated = await tx.workflowInstance.updateMany({
      where: { id: instance.id, version: instance.version },
      data: { currentStateId: toStateId, version: { increment: 1 } },
    });

    if (updated.count === 0) {
      throw new ConflictError("this work moved while the transition was being applied; reload and try again", {
        instanceId: instance.id,
        version: instance.version,
      });
    }

    await tx.transitionLog.create({
      data: {
        instanceId: instance.id,
        transitionId,
        fromStateId: instance.currentStateId,
        toStateId,
        actorKind: ctx.actor.kind,
        ...(ctx.actor.id ? { actorId: ctx.actor.id } : {}),
        ...(options.note ? { payload: { note: options.note } } : {}),
      },
    });

    return {
      instanceId: instance.id,
      fromStateKey: decision.from.key,
      toStateKey: decision.to.key,
      version: instance.version + 1,
    };
  });
}

const historyInclude = {
  fromState: { select: { key: true, label: true } },
  toState: { select: { key: true, label: true } },
} satisfies Prisma.TransitionLogInclude;

export type TransitionHistoryEntry = Prisma.TransitionLogGetPayload<{ include: typeof historyInclude }>;

/** Oldest first: a log is read as a story, and stories start at the beginning. */
export async function transitionHistory(ctx: Ctx, instanceId: string): Promise<TransitionHistoryEntry[]> {
  return ctx.db.transitionLog.findMany({
    where: { instanceId },
    orderBy: { at: "asc" },
    include: historyInclude,
  });
}
