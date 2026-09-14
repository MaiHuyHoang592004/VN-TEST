-- DropIndex
DROP INDEX "fulfillment_active_queue";

-- AlterTable
ALTER TABLE "ShopifyFulfillmentOrderLine" ADD COLUMN     "assignedLocationId" TEXT;

-- CreateIndex
CREATE INDEX "fulfillment_active_queue" ON "Fulfillment"("status", "dueAt") WHERE (status IN ('QUEUED','IN_PRODUCTION','READY_TO_SHIP','BLOCKED'));
