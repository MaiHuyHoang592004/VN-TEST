-- CreateEnum
CREATE TYPE "InventoryItemType" AS ENUM ('MATERIAL', 'PRODUCT');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'MANUAL_IMPORT', 'MANUAL_ADJUSTMENT', 'RESERVE', 'RESERVE_RELEASE', 'CONSUME', 'RETURN', 'NEEDED', 'NEEDED_RESOLVED');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReceiptShipmentStatus" AS ENUM ('PENDING', 'PARTIAL_RECEIVED', 'RECEIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED', 'RETURNED');

-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BomStage" AS ENUM ('PRODUCTION', 'PACKING', 'SHIPPING', 'OTHER');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('RAW_MATERIAL', 'PACKAGING', 'SEMI_FINISHED', 'CONSUMABLE', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'MATERIAL_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MATERIAL_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'STOCK_ADJUSTED';
ALTER TYPE "AuditAction" ADD VALUE 'RECEIPT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'RECEIPT_RECEIVED';
ALTER TYPE "AuditAction" ADD VALUE 'RECEIPT_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'BOM_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'BOM_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'BOM_ACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'BOM_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_UPDATED';
