-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'VARIANT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'VARIANT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'VARIANT_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'VARIANT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'SKU_ATTACHED';
ALTER TYPE "AuditAction" ADD VALUE 'SKU_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SKU_PRICES_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MOCKUP_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MOCKUP_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MOCKUP_DELETED';
