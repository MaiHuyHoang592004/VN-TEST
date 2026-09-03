-- Staff ↔ warehouse membership (many-to-many), replacing the legacy
-- one-warehouse-per-person ceiling.

-- CreateTable
CREATE TABLE "warehouse_members" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouse_members_warehouse_id_idx" ON "warehouse_members"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_members_user_id_warehouse_id_key" ON "warehouse_members"("user_id", "warehouse_id");

-- AddForeignKey
ALTER TABLE "warehouse_members" ADD CONSTRAINT "warehouse_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_members" ADD CONSTRAINT "warehouse_members_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every user already pinned to a warehouse becomes a primary member
-- of that site, so membership is authoritative from day one.
INSERT INTO "warehouse_members" ("user_id", "warehouse_id", "is_primary", "created_at")
SELECT "id", "warehouse_id", true, now()
FROM "users"
WHERE "warehouse_id" IS NOT NULL
ON CONFLICT ("user_id", "warehouse_id") DO NOTHING;
