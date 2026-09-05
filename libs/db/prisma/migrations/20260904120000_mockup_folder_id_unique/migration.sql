-- One Drive folder is one mockup. Legacy orders.image_url stores a Drive
-- FOLDER link, and many orders share a folder (489 orders / 426 folders), so
-- the resolver upserts a mockup by folder id — which needs this to be unique
-- or two concurrent resolves create two rows for one folder.
--
-- Safe as an additive index: the table is empty at the time of writing, and
-- the column stays nullable (Postgres allows many NULLs in a unique index),
-- so mockups that are not Drive-backed are unaffected.

-- CreateIndex
CREATE UNIQUE INDEX "mockups_folder_id_key" ON "mockups"("folder_id");
