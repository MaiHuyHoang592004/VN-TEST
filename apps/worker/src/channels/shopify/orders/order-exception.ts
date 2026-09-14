import type { Prisma, ExceptionCode } from "@fulfillflow/db";

/** Caller holds the channel entity lock; the partial unique index is the final guard. */
export async function openOrderException(
  tx: Prisma.TransactionClient,
  data: { organizationId: string; orderId: string; ingestionRecordId: string; code: ExceptionCode; message: string; details?: Prisma.InputJsonValue },
) {
  const subjectKey = `order:${data.orderId}`;
  if (await tx.exceptionCase.findFirst({ where: { subjectKey, code: data.code, status: "OPEN" } })) return;
  await tx.exceptionCase.create({ data: { ...data, subjectKey, visibility: "MERCHANT" } });
}
