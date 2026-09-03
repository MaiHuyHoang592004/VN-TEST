-- CreateTable
CREATE TABLE "stock_receipts" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "item_type" "InventoryItemType" NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "note" TEXT,
    "reject_reason" TEXT,
    "created_by_id" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receipt_shipments" (
    "id" SERIAL NOT NULL,
    "receipt_id" INTEGER NOT NULL,
    "vendor_id" INTEGER,
    "shipment_code" TEXT NOT NULL,
    "tracking_number" TEXT,
    "carrier" TEXT,
    "tracking_url" TEXT,
    "expected_arrival_at" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "status" "ReceiptShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "metadata" JSONB,
    "evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_receipt_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receipt_lines" (
    "id" SERIAL NOT NULL,
    "receipt_id" INTEGER NOT NULL,
    "shipment_id" INTEGER,
    "material_id" INTEGER,
    "product_variant_id" INTEGER,
    "requested_quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER,
    "rejected_quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(10,2),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipts_code_key" ON "stock_receipts"("code");

-- CreateIndex
CREATE INDEX "stock_receipts_warehouse_id_status_idx" ON "stock_receipts"("warehouse_id", "status");

-- CreateIndex
CREATE INDEX "stock_receipt_shipments_vendor_id_idx" ON "stock_receipt_shipments"("vendor_id");

-- CreateIndex
CREATE INDEX "stock_receipt_shipments_status_expected_arrival_at_idx" ON "stock_receipt_shipments"("status", "expected_arrival_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipt_shipments_receipt_id_shipment_code_key" ON "stock_receipt_shipments"("receipt_id", "shipment_code");

-- CreateIndex
CREATE INDEX "stock_receipt_lines_receipt_id_idx" ON "stock_receipt_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "stock_receipt_lines_shipment_id_idx" ON "stock_receipt_lines"("shipment_id");

-- CreateIndex
CREATE INDEX "stock_receipt_lines_material_id_idx" ON "stock_receipt_lines"("material_id");

-- CreateIndex
CREATE INDEX "stock_receipt_lines_product_variant_id_idx" ON "stock_receipt_lines"("product_variant_id");

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_shipments" ADD CONSTRAINT "stock_receipt_shipments_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_shipments" ADD CONSTRAINT "stock_receipt_shipments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_lines" ADD CONSTRAINT "stock_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_lines" ADD CONSTRAINT "stock_receipt_lines_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "stock_receipt_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_lines" ADD CONSTRAINT "stock_receipt_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_lines" ADD CONSTRAINT "stock_receipt_lines_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A receipt line points at exactly one thing: a material or a product
-- variant, never both and never neither. Hand-written because Prisma has no
-- CHECK syntax — a line with both filled would move stock twice, and one with
-- neither would move it nowhere while still reporting as received.
ALTER TABLE "stock_receipt_lines" ADD CONSTRAINT "line_target_xor" CHECK
  (("material_id" IS NULL) <> ("product_variant_id" IS NULL));
