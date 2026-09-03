-- CreateTable
CREATE TABLE "boms" (
    "id" SERIAL NOT NULL,
    "product_variant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "note" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_lines" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "material_id" INTEGER,
    "component_sku" TEXT NOT NULL,
    "component_name" TEXT,
    "quantity_per_unit" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "wastage_rate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "stage" "BomStage" NOT NULL DEFAULT 'PRODUCTION',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boms_product_variant_id_status_idx" ON "boms"("product_variant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "boms_product_variant_id_version_key" ON "boms"("product_variant_id", "version");

-- CreateIndex
CREATE INDEX "bom_lines_bom_id_idx" ON "bom_lines"("bom_id");

-- CreateIndex
CREATE INDEX "bom_lines_material_id_idx" ON "bom_lines"("material_id");

-- AddForeignKey
ALTER TABLE "boms" ADD CONSTRAINT "boms_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
