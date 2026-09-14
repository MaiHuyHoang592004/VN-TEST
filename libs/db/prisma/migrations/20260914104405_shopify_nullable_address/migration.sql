-- DropIndex
DROP INDEX "fulfillment_active_queue";

-- AlterTable
ALTER TABLE "OrderAddress" ADD COLUMN     "validationErrors" JSONB,
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "line1" DROP NOT NULL,
ALTER COLUMN "city" DROP NOT NULL,
ALTER COLUMN "postalCode" DROP NOT NULL,
ALTER COLUMN "countryCode" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "fulfillment_active_queue" ON "Fulfillment"("status", "dueAt") WHERE (status IN ('QUEUED','IN_PRODUCTION','READY_TO_SHIP','BLOCKED'));
