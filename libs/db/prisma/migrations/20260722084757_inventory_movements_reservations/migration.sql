-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" BIGSERIAL NOT NULL,
    "item_type" "InventoryItemType" NOT NULL,
    "material_id" INTEGER,
    "product_variant_id" INTEGER,
    "warehouse_id" INTEGER NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reservation_id" INTEGER,
    "bom_id" INTEGER,
    "bom_line_id" INTEGER,
    "order_id" INTEGER,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "created_by_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" SERIAL NOT NULL,
    "item_type" "InventoryItemType" NOT NULL,
    "material_id" INTEGER,
    "product_variant_id" INTEGER,
    "warehouse_id" INTEGER NOT NULL,
    "bom_id" INTEGER,
    "bom_line_id" INTEGER,
    "order_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "consumed_quantity" INTEGER NOT NULL DEFAULT 0,
    "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "created_by_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_movements_item_type_material_id_idx" ON "inventory_movements"("item_type", "material_id");

-- CreateIndex
CREATE INDEX "inventory_movements_item_type_product_variant_id_idx" ON "inventory_movements"("item_type", "product_variant_id");

-- CreateIndex
CREATE INDEX "inventory_movements_warehouse_id_created_at_idx" ON "inventory_movements"("warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_order_id_idx" ON "inventory_movements"("order_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_order_id_idx" ON "inventory_reservations"("order_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_item_type_material_id_status_idx" ON "inventory_reservations"("item_type", "material_id", "status");

-- CreateIndex
CREATE INDEX "inventory_reservations_item_type_product_variant_id_status_idx" ON "inventory_reservations"("item_type", "product_variant_id", "status");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same rule as receipt lines: a movement and a reservation each point at
-- exactly one item. Without this a row could raise `reserved` on a material
-- while reporting itself as a product, and no query would ever find the pair.
ALTER TABLE "inventory_movements" ADD CONSTRAINT "movement_target_xor" CHECK
  (("material_id" IS NULL) <> ("product_variant_id" IS NULL));

ALTER TABLE "inventory_reservations" ADD CONSTRAINT "reservation_target_xor" CHECK
  (("material_id" IS NULL) <> ("product_variant_id" IS NULL));
