import { Prisma, type PrismaClient } from "@fulfillflow/db";

export class InsufficientStockError extends Error {
  readonly inventoryItemId: string;
  readonly facilityId: string;
  constructor(inventoryItemId: string, facilityId: string) {
    super(`insufficient stock for inventoryItem ${inventoryItemId} at facility ${facilityId}`);
    this.inventoryItemId = inventoryItemId;
    this.facilityId = facilityId;
  }
}

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Atomically increments `reserved` by `quantity`, guarded so it can never
 * push `reserved` above `onHand`. The guard and the increment are one SQL
 * statement, so concurrent callers racing the same row serialize on
 * Postgres's row lock instead of racing a read-then-write in application
 * code. Throws InsufficientStockError (not a return value) so callers get
 * an automatic transaction rollback of any partial work already done in the
 * same reserveFulfillment attempt.
 */
export async function incrementReserved(tx: Tx, facilityId: string, inventoryItemId: string, quantity: Prisma.Decimal): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "InventoryBalance"
    SET reserved = reserved + ${quantity.toString()}::numeric
    WHERE "facilityId" = ${facilityId} AND "inventoryItemId" = ${inventoryItemId}
      AND ("onHand" - reserved) >= ${quantity.toString()}::numeric
  `;
  if (updated !== 1) throw new InsufficientStockError(inventoryItemId, facilityId);
}

/** Idempotent: only decrements while at least `quantity` remains reserved. */
export async function decrementReserved(tx: Tx, facilityId: string, inventoryItemId: string, quantity: Prisma.Decimal): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "InventoryBalance"
    SET reserved = reserved - ${quantity.toString()}::numeric
    WHERE "facilityId" = ${facilityId} AND "inventoryItemId" = ${inventoryItemId}
      AND reserved >= ${quantity.toString()}::numeric
  `;
  if (updated !== 1) throw new Error(`reservation balance cannot be decremented for inventoryItem ${inventoryItemId} at facility ${facilityId}`);
}

/** Consumption removes stock from both onHand and reserved together (it leaves inventory for good). */
export async function decrementOnHandAndReserved(tx: Tx, facilityId: string, inventoryItemId: string, quantity: Prisma.Decimal): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "InventoryBalance"
    SET "onHand" = "onHand" - ${quantity.toString()}::numeric, reserved = reserved - ${quantity.toString()}::numeric
    WHERE "facilityId" = ${facilityId} AND "inventoryItemId" = ${inventoryItemId}
      AND reserved >= ${quantity.toString()}::numeric AND "onHand" >= ${quantity.toString()}::numeric
  `;
  if (updated !== 1) throw new Error(`consumption balance invariant violated for inventoryItem ${inventoryItemId} at facility ${facilityId}`);
}
