-- Idempotency key for admin money moves. Nullable + UNIQUE: existing rows keep
-- NULL (Postgres permits many NULLs under a UNIQUE index), and a repeated money
-- move collides on the second insert instead of double-crediting.

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotency_key_key" ON "transactions"("idempotency_key");
