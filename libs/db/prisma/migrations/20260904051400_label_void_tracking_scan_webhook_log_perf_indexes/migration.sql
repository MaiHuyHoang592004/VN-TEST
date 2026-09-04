-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('DELIVERED', 'FAILED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'LABEL_VOIDED';

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "last_scan_at" TIMESTAMP(3),
ADD COLUMN     "last_scan_detail" TEXT,
ADD COLUMN     "last_scan_status" TEXT,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_deliveries_user_id_created_at_idx" ON "webhook_deliveries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_placed_at_idx" ON "orders"("status", "placed_at");

-- CreateIndex
CREATE INDEX "orders_warehouse_id_status_idx" ON "orders"("warehouse_id", "status");

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
