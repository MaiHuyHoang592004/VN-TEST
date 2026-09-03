-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TRANSACTION_REQUESTED';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "metadata" JSONB;
