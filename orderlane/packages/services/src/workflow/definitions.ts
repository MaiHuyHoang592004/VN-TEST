import { validateDefinition, type WorkflowDefinition } from "@orderlane/core/workflow";

import type { Ctx } from "../context.ts";
import { NotFoundError, ValidationError } from "../errors.ts";

/**
 * Persisting and loading workflow definitions.
 *
 * The engine in @orderlane/core works on plain objects and knows nothing about
 * rows. This module is the only place the two representations meet, which is
 * why the engine can stay dependency-free and testable without a database.
 */

export interface LoadedDefinition {
  readonly id: string;
  /** The plain object the engine consumes. */
  readonly definition: WorkflowDefinition;
  readonly stateIdByKey: ReadonlyMap<string, string>;
  readonly stateKeyById: ReadonlyMap<string, string>;
  readonly transitionIdByKey: ReadonlyMap<string, string>;
}

/**
 * Publish a definition. Validated before anything is written: a process with
 * an unreachable state must never reach the database, because by the time work
 * is stuck in one it is too late to fix cheaply.
 *
 * Activating deactivates the previous active version of the same key, in the
 * same transaction — there is no window in which a tenant has two active
 * versions, or none.
 */
export async function installDefinition(
  ctx: Ctx,
  definition: WorkflowDefinition,
  options: { activate?: boolean } = {},
): Promise<string> {
  const issues = validateDefinition(definition);
  if (issues.length > 0) {
    throw new ValidationError(
      `workflow "${definition.key}" is not a valid process: ${issues.length} issue(s)`,
      issues,
    );
  }

  const activate = options.activate ?? true;

  return ctx.db.$transaction(async (tx) => {
    if (activate) {
      await tx.workflowDefinition.updateMany({
        where: { key: definition.key, isActive: true },
        data: { isActive: false },
      });
    }

    const row = await tx.workflowDefinition.create({
      data: {
        tenantId: ctx.tenantId,
        key: definition.key,
        version: definition.version,
        name: definition.name,
        isActive: activate,
      },
    });

    // States first: transitions reference them by id.
    const stateIdByKey = new Map<string, string>();
    for (const state of definition.states) {
      const created = await tx.workflowState.create({
        data: {
          tenantId: ctx.tenantId,
          definitionId: row.id,
          key: state.key,
          label: state.label,
          kind: state.kind,
          position: state.position ?? 0,
        },
      });
      stateIdByKey.set(state.key, created.id);
    }

    for (const transition of definition.transitions) {
      await tx.workflowTransition.create({
        data: {
          tenantId: ctx.tenantId,
          definitionId: row.id,
          key: transition.key,
          label: transition.label,
          fromStateId: stateIdByKey.get(transition.from)!,
          toStateId: stateIdByKey.get(transition.to)!,
          requiredRole: transition.requiredRole ?? null,
          guards: (transition.guards ?? []) as object[],
        },
      });
    }

    return row.id;
  });
}

/** Rebuild the engine's plain definition from its rows. */
export async function loadDefinition(ctx: Ctx, definitionId: string): Promise<LoadedDefinition> {
  const row = await ctx.db.workflowDefinition.findUnique({
    where: { id: definitionId },
    include: { states: { orderBy: { position: "asc" } }, transitions: true },
  });
  if (!row) throw new NotFoundError("workflow definition", definitionId);

  const stateKeyById = new Map(row.states.map((s) => [s.id, s.key]));
  const stateIdByKey = new Map(row.states.map((s) => [s.key, s.id]));

  return {
    id: row.id,
    stateIdByKey,
    stateKeyById,
    transitionIdByKey: new Map(row.transitions.map((t) => [t.key, t.id])),
    definition: {
      key: row.key,
      version: row.version,
      name: row.name,
      states: row.states.map((s) => ({
        key: s.key,
        label: s.label,
        kind: s.kind,
        position: s.position,
      })),
      transitions: row.transitions.map((t) => ({
        key: t.key,
        label: t.label,
        from: stateKeyById.get(t.fromStateId)!,
        to: stateKeyById.get(t.toStateId)!,
        requiredRole: t.requiredRole,
        guards: (t.guards ?? []) as { kind: string }[],
      })),
    },
  };
}

/** The version new instances should start on. */
export async function activeDefinition(ctx: Ctx, key: string): Promise<LoadedDefinition> {
  const row = await ctx.db.workflowDefinition.findFirst({
    where: { key, isActive: true },
    orderBy: { version: "desc" },
  });
  if (!row) throw new NotFoundError("active workflow definition", key);
  return loadDefinition(ctx, row.id);
}

/**
 * Switch which version of a process new work starts on.
 *
 * Deactivate and activate happen in one transaction: there is no instant at
 * which a tenant has two active versions of a key, or none at all.
 */
export async function setActiveDefinition(ctx: Ctx, key: string, version?: number): Promise<string> {
  const target = await ctx.db.workflowDefinition.findFirst({
    where: { key, ...(version === undefined ? {} : { version }) },
    orderBy: { version: "desc" },
  });
  if (!target) throw new NotFoundError("workflow definition", version ? `${key}@${version}` : key);

  await ctx.db.$transaction(async (tx) => {
    await tx.workflowDefinition.updateMany({ where: { key, isActive: true }, data: { isActive: false } });
    await tx.workflowDefinition.updateMany({ where: { id: target.id }, data: { isActive: true } });
  });

  return target.id;
}
