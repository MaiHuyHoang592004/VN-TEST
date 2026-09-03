-- Optional per-user product allow-list, replacing the legacy untyped
-- `configs.products` JSON array. No rows = no restriction.

-- CreateTable
CREATE TABLE "user_allowed_products" (
    "user_id" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_allowed_products_pkey" PRIMARY KEY ("user_id","product_id")
);

-- CreateIndex
CREATE INDEX "user_allowed_products_product_id_idx" ON "user_allowed_products"("product_id");

-- AddForeignKey
ALTER TABLE "user_allowed_products" ADD CONSTRAINT "user_allowed_products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_allowed_products" ADD CONSTRAINT "user_allowed_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
