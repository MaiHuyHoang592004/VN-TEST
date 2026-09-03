-- API key rotation + revocation. Legacy keys could be neither rotated nor
-- revoked; a leak had no self-service fix.
--
-- prefix defaults to '' — legacy imported keys were hashed on import, so
-- their leading characters are unrecoverable and stay blank in the UI.

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "prefix" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "revoked_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "api_keys_user_id_revoked_at_idx" ON "api_keys"("user_id", "revoked_at");
