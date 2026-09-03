-- AlterTable
ALTER TABLE "users" ADD COLUMN     "admin_note" TEXT,
ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "pending_email" TEXT,
ADD COLUMN     "sessions_valid_from" TIMESTAMP(3),
ADD COLUMN     "tax_id" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';

-- CreateIndex
CREATE INDEX "users_status_deleted_at_idx" ON "users"("status", "deleted_at");
