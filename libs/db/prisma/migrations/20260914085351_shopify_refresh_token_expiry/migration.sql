-- DropIndex
DROP INDEX "fulfillment_active_queue";

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "refreshTokenExpiresAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "fulfillment_active_queue" ON "Fulfillment"("status", "dueAt") WHERE (status IN ('QUEUED','IN_PRODUCTION','READY_TO_SHIP','BLOCKED'));
