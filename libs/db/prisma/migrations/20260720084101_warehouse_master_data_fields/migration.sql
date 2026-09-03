-- Warehouse master data: code, description, region, timezone, contact, soft delete.
--
-- `code` is UNIQUE NOT NULL. Prisma's generated SQL adds it NOT NULL in one
-- step, which fails on any database that already holds warehouse rows (prod
-- carries the migrated legacy data). Hand-written as add-nullable → backfill →
-- set-not-null so it is safe on an empty local DB and on a populated prod.

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "code" TEXT,
ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_name" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "line2" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';

-- Backfill: first 8 alphanumerics of the name, uppercased, suffixed with the
-- row id. The id suffix guarantees uniqueness even when two sites share a
-- name; NULLIF handles names with no alphanumerics at all.
UPDATE "warehouses"
SET "code" = COALESCE(
      NULLIF(UPPER(LEFT(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '', 'g'), 8)), ''),
      'WH'
    ) || '-' || "id"::text
WHERE "code" IS NULL;

ALTER TABLE "warehouses" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_status_deleted_at_idx" ON "warehouses"("status", "deleted_at");
