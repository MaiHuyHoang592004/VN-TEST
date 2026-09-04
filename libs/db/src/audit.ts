/**
 * Append-only audit trail. One column per sensitive action (money, roles, status,
 * credentials, customer changes). The legacy system had none.
 *
 * writeAudit takes a TRANSACTION client, not the global prisma, so the log
 * entry commits in the same transaction as the change it records — a mutation
 * can never exist without its audit column, and a rolled-back mutation leaves no
 * phantom log. Callers therefore MUST call this inside prisma.$transaction.
 *
 * Never pass secrets in before/after (no password hashes, key material or
 * tokens) and diff changed fields only, not whole rows.
 */
import type { AuditAction, Prisma } from "./generated/prisma/client.ts";
import type { SessionUser } from "@gwprint/shared";

export type AuditContext = {
  /** Who did it. Null only for system/cron actions. */
  actor: SessionUser | null;
  /** Captured from the request in the transport layer, for forensics. */
  ip?: string | null;
  userAgent?: string | null;
};

export type AuditInput = {
  action: AuditAction;
  targetType:
    | "user"
    | "customer"
    | "order"
    | "transaction"
    | "api_key"
    | "invite"
    | "variant"
    | "product"
    | "sku"
    | "mockup"
    | "material"
    | "stock"
    | "receipt"
    | "bom"
    | "vendor"
    | "ticket"
    | "expense"
    | "expense_category";
  targetId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string | null;
};

/** A minimal transaction-client shape — just the audit model, so this file
 * doesn't depend on the full client type. */
type AuditTx = { auditLog: { create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown> } };

export async function writeAudit(
  tx: AuditTx,
  ctx: AuditContext,
  input: AuditInput,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: input.action,
      actorId: ctx.actor?.id ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      before: input.before,
      after: input.after,
      reason: input.reason ?? null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });
}
