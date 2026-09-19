import { createHash } from "node:crypto";

import { planImport, summarize, type PlanSummary, type RowValues } from "@orderlane/core/import";
import type { ImportKind } from "@orderlane/db";

import type { Ctx } from "../context.ts";
import { ConflictError, NotFoundError, ValidationError, isUniqueViolation } from "../errors.ts";
import { requireRole } from "../identity/tenants.ts";
import type { PersistedImportAdapter } from "./adapter.ts";
import { catalogAdapter } from "./adapters/catalog.ts";
import { ordersAdapter } from "./adapters/orders.ts";

/**
 * The two-phase import: stage and plan, show the operator what will happen,
 * then apply only what they confirmed.
 */

const ADAPTERS: Record<ImportKind, PersistedImportAdapter<never>> = {
  ORDERS: ordersAdapter as PersistedImportAdapter<never>,
  CATALOG: catalogAdapter as PersistedImportAdapter<never>,
  STOCK: ordersAdapter as PersistedImportAdapter<never>,
};

function adapterFor(kind: ImportKind): PersistedImportAdapter<RowValues> {
  const adapter = ADAPTERS[kind];
  if (!adapter) throw new ValidationError(`no import adapter for "${kind}"`);
  return adapter as unknown as PersistedImportAdapter<RowValues>;
}

export interface StageInput {
  readonly kind: ImportKind;
  readonly filename: string;
  /** Already parsed out of the spreadsheet: header name → cell value. */
  readonly rows: readonly Readonly<Record<string, unknown>>[];
}

export interface StagedJob {
  readonly jobId: string;
  readonly summary: PlanSummary;
  /** Set when this exact file has been staged before. Reported, never blocked. */
  readonly previousJobId?: string;
}

/**
 * Phase one. Parses, validates, hashes and plans — and writes nothing outside
 * the two staging tables. An operator can stage a file they are unsure about
 * and simply never commit it.
 */
export async function stageImport(ctx: Ctx, input: StageInput): Promise<StagedJob> {
  requireRole(ctx, "OPERATOR");

  const adapter = adapterFor(input.kind);
  const fileChecksum = createHash("sha256")
    .update(JSON.stringify(input.rows), "utf8")
    .digest("hex");

  const previous = await ctx.db.importJob.findFirst({
    where: { kind: input.kind, fileChecksum, status: { in: ["PREVIEW", "COMPLETED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const parsed = input.rows.map((raw, index) => adapter.parse(raw, index + 1));

  // What has already been applied, and what already exists. Both are read
  // once for the whole file rather than per row.
  const applications = await ctx.db.importApplication.findMany({
    where: { kind: input.kind },
    select: { rowHash: true },
  });
  const appliedHashes = new Set(applications.map((r) => r.rowHash));
  const existingIdentities = await identitiesFor(ctx, input.kind);

  const planned = planImport(parsed, adapter, { appliedHashes, existingIdentities });
  const summary = summarize(planned);

  const jobId = await ctx.db.$transaction(async (tx) => {
    const job = await tx.importJob.create({
      data: {
        tenantId: ctx.tenantId,
        kind: input.kind,
        status: "PREVIEW",
        filename: input.filename,
        fileChecksum,
        totalRows: summary.total,
        validRows: summary.create + summary.update,
        invalidRows: summary.invalid,
        createdById: ctx.actor.id ?? (await tx.membership.findFirstOrThrow({ select: { userId: true } })).userId,
      },
    });

    await tx.importRow.createMany({
      data: planned.map((row) => ({
        tenantId: ctx.tenantId,
        jobId: job.id,
        kind: input.kind,
        lineNumber: row.lineNumber,
        raw: row.raw as object,
        // An invalid row has no business content to hash, so it gets a hash of
        // its position instead: unique enough to satisfy the constraint, and
        // meaningless enough that it can never collide with a real row.
        rowHash: row.rowHash ?? `invalid:${job.id}:${row.lineNumber}`,
        status: row.status,
        action: row.action,
        issues: row.issues as object[],
      })),
    });

    return job.id;
  });

  return previous ? { jobId, summary, previousJobId: previous.id } : { jobId, summary };
}

/** The business keys that already exist, so the plan can say CREATE or UPDATE. */
async function identitiesFor(ctx: Ctx, kind: ImportKind): Promise<Set<string>> {
  if (kind === "CATALOG") {
    const variants = await ctx.db.variant.findMany({ select: { sku: true } });
    return new Set(variants.map((v) => v.sku));
  }
  const lines = await ctx.db.orderLine.findMany({
    where: { order: { externalRef: { not: null } } },
    select: { sku: true, order: { select: { externalRef: true } } },
  });
  return new Set(lines.map((l) => `${l.order.externalRef}::${l.sku}`));
}

export interface ImportPreview {
  readonly jobId: string;
  readonly kind: ImportKind;
  readonly filename: string;
  readonly status: string;
  readonly summary: PlanSummary;
  readonly rows: readonly {
    lineNumber: number;
    status: string;
    action: string;
    issues: unknown;
    raw: unknown;
  }[];
}

export async function previewImport(ctx: Ctx, jobId: string, limit = 100): Promise<ImportPreview> {
  const job = await ctx.db.importJob.findUnique({
    where: { id: jobId },
    include: { rows: { orderBy: { lineNumber: "asc" }, take: limit } },
  });
  if (!job) throw new NotFoundError("import job", jobId);

  const counts = await ctx.db.importRow.groupBy({
    by: ["status", "action"],
    where: { jobId },
    _count: { _all: true },
  });

  let create = 0;
  let update = 0;
  let invalid = 0;
  let skipped = 0;
  for (const row of counts) {
    const n = row._count._all;
    if (row.status === "INVALID") invalid += n;
    else if (row.status === "SKIPPED") skipped += n;
    else if (row.action === "CREATE") create += n;
    else if (row.action === "UPDATE") update += n;
  }

  return {
    jobId: job.id,
    kind: job.kind,
    filename: job.filename,
    status: job.status,
    summary: { total: job.totalRows, create, update, invalid, skipped },
    rows: job.rows.map((r) => ({
      lineNumber: r.lineNumber,
      status: r.status,
      action: r.action,
      issues: r.issues,
      raw: r.raw,
    })),
  };
}

export interface CommitResult {
  readonly applied: number;
  /** Rows another commit had already applied. Not failures. */
  readonly skipped: number;
  readonly failed: number;
  readonly failures: readonly { lineNumber: number; message: string }[];
}

/**
 * Phase two. One transaction per row.
 *
 * A batch-wide transaction would mean row 500 failing rolls back 499
 * successes — the behaviour staging exists to avoid. The cost is that a
 * partially committed job is a real state, so it is reported honestly
 * ("312 of 500 applied") rather than pretended away, and a re-run resumes:
 * rows already APPLIED are skipped by their own status.
 */
export async function commitImport(ctx: Ctx, jobId: string): Promise<CommitResult> {
  requireRole(ctx, "OPERATOR");

  const job = await ctx.db.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError("import job", jobId);
  if (job.status === "COMPLETED") throw new ConflictError("this import has already been committed");
  if (job.status !== "PREVIEW") throw new ConflictError(`an import in status ${job.status} cannot be committed`);

  const adapter = adapterFor(job.kind);

  await ctx.db.importJob.updateMany({ where: { id: jobId }, data: { status: "COMMITTING" } });

  const rows = await ctx.db.importRow.findMany({
    where: { jobId, status: "VALID" },
    orderBy: { lineNumber: "asc" },
  });

  let applied = 0;
  let skipped = 0;
  const failures: { lineNumber: number; message: string }[] = [];

  for (const row of rows) {
    const parsed = adapter.parse(row.raw as Record<string, unknown>, row.lineNumber);
    if (!parsed.values) {
      failures.push({ lineNumber: row.lineNumber, message: "row no longer parses" });
      continue;
    }
    try {
      // One transaction per row, and it covers BOTH the domain write and the
      // record that this row's content has been applied. If the record were
      // written separately, a crash between the two would let a re-run apply
      // the same row twice — which is the one thing this pipeline promises
      // never to do.
      await ctx.db.$transaction(async (tx) => {
        const targetId = await adapter.apply(tx, ctx, parsed.values!);
        await tx.importApplication.create({
          data: {
            tenantId: ctx.tenantId,
            kind: job.kind,
            rowHash: row.rowHash,
            importRowId: row.id,
            targetId,
          },
        });
        await tx.importRow.updateMany({ where: { id: row.id }, data: { status: "APPLIED", targetId } });
      });
      applied += 1;
    } catch (error) {
      // Another commit got there first — a concurrent job, or a re-run of this
      // one. Not a failure: the row's work is done.
      if (isUniqueViolation(error)) {
        await ctx.db.importRow.updateMany({ where: { id: row.id }, data: { status: "SKIPPED" } });
        skipped += 1;
        continue;
      }
      // One row's failure is that row's failure. It is recorded on the row and
      // the loop carries on.
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ lineNumber: row.lineNumber, message });
      await ctx.db.importRow.updateMany({
        where: { id: row.id },
        data: {
          status: "INVALID",
          issues: [...(row.issues as object[]), { code: "apply_failed", message }],
        },
      });
    }
  }

  await ctx.db.importJob.updateMany({
    where: { id: jobId },
    data: {
      status: failures.length > 0 && applied === 0 ? "FAILED" : "COMPLETED",
      appliedRows: applied,
      invalidRows: job.invalidRows + failures.length,
      committedAt: new Date(),
    },
  });

  return { applied, skipped, failed: failures.length, failures };
}
