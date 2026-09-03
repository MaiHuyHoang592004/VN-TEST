-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_CREATED', 'USER_UPDATED', 'USER_ROLE_CHANGED', 'USER_STATUS_CHANGED', 'USER_DELETED', 'USER_INVITED', 'USER_INVITE_REVOKED', 'PASSWORD_CHANGED', 'EMAIL_CHANGED', 'API_KEY_CREATED', 'API_KEY_REVOKED', 'BALANCE_TOPUP', 'BALANCE_REFUND', 'BALANCE_ADJUSTED', 'WAREHOUSE_CREATED', 'WAREHOUSE_UPDATED', 'WAREHOUSE_STATUS_CHANGED', 'WAREHOUSE_MEMBER_ADDED', 'WAREHOUSE_MEMBER_REMOVED', 'WEBHOOK_UPDATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'WAREHOUSE_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'DESIGNER';
