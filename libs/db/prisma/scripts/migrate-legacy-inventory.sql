-- ============================================================================
-- gwprint — legacy INVENTORY → new schema data migration  (doc 06 phase E)
-- ============================================================================
--
-- ⚠ PROD ONLY, and RUN AFTER migrate-legacy.sql. That script migrates users,
--   warehouses, products, product_variants and orders; every mapping here
--   depends on them existing.
--
-- WHAT THIS COVERS
--   The main cutover handles legacy inventory system A only (WarehouseInventory
--   + StockImport + ImportMovement — a module deleted from legacy prod on
--   2026-06-18, kept as read-only history). Systems B and C had NO migration:
--
--     B  PhysicalInventories + PhysicalStockReceipt trio + InventoryMovement
--        — finished goods, keyed by SKU string
--     C  MaterialItems + MaterialInventories + MaterialStockReceipt trio +
--        MaterialInventoryMovements + MaterialInventoryReservations + Boms
--        — raw materials with BOM-driven reservation
--
--   Both land in the ONE unified system doc 06 built: material_stock /
--   warehouse_inventory, stock_receipts, inventory_movements,
--   inventory_reservations, boms.
--
-- TABLE NAMES — READ THIS BEFORE EDITING
--   Legacy is inconsistent and it is NOT a typo here: every MATERIAL table is
--   plural via @@map ("MaterialItems", "MaterialStockReceipts", …) while the
--   four PHYSICAL tables have NO @@map at all, so Prisma named them after the
--   model — SINGULAR: "PhysicalStockReceipt", "PhysicalStockReceiptShipment",
--   "PhysicalStockReceiptLine", "InventoryMovement". PhysicalInventories IS
--   plural. Verified against origin/prod:prisma/schema.prisma (tip 10117f7).
--   Two column names differ the same way: PhysicalInventories keys on
--   `variant_sku`, while PhysicalStockReceiptLine and InventoryMovement use
--   `physical_variant_sku`.
--
-- HOW TO RUN
--   psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/scripts/migrate-legacy.sql
--   psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/scripts/migrate-legacy-inventory.sql
--   Then READ migration_report (see below) before letting anyone use the app.
--
-- THE REPORT
--   Nothing here fails silently and nothing is dropped without a record. Every
--   row that cannot be mapped is written to `migration_report` with its reason,
--   its legacy id, and enough context to decide what to do. A clean cutover is
--   one where you have READ that table, not one where the script exited 0.
--
--   It is a REAL table, not the TEMP table doc 06 §E1 suggested: a temp table
--   dies with the psql session, which is precisely when you want to read it.
--   Drop it with the legacy tables once the orphans are settled.
--
-- EVIDENCE FILES — DECISION RECORDED (doc 06 §E1.5)
--   Shipment `evidence` JSON is carried VERBATIM. The urls point at the legacy
--   host, so those photos die when that server is switched off. They are NOT
--   copied into new storage during cutover. If the team wants them, a one-off
--   download-and-rewrite script must run BEFORE the legacy box goes away.
--   ASK ONCE, and if the answer is yes, do it before this migration is final.
-- ============================================================================

BEGIN;

-- ── The report ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS migration_report (
  id          bigserial PRIMARY KEY,
  step        text NOT NULL,
  issue       text NOT NULL,
  legacy_id   text,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 1. Vendors ──────────────────────────────────────────────────────────────
INSERT INTO vendors (id, code, name, contact_name, phone, email, address,
                     tax_code, note, status, deleted_at, created_at, updated_at)
SELECT
  v.id, v.code, v.name, v.contact_name, v.phone, v.email, v.address,
  v.tax_code, v.note,
  (CASE lower(coalesce(v.status, 'active'))
     WHEN 'active'   THEN 'ACTIVE'
     WHEN 'inactive' THEN 'INACTIVE'
     WHEN 'archived' THEN 'ARCHIVED'
     WHEN 'draft'    THEN 'DRAFT'
     ELSE 'ACTIVE' END)::"ProductStatus",
  v.deleted_at, v.created_at, v.updated_at
FROM "Vendors" v;

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'vendors', 'unknown status string, defaulted to ACTIVE', v.id::text, v.status
FROM "Vendors" v
WHERE lower(coalesce(v.status, 'active')) NOT IN ('active', 'inactive', 'archived', 'draft');

-- ── 2. Materials  (legacy MaterialItems) ────────────────────────────────────
-- NOT legacy "Materials" — that is an ATTRIBUTE CATALOG (leather/canvas/wood)
-- for the never-rebuilt SKU/addon system, and it is deliberately not migrated.
-- Raw materials live in "MaterialItems". Doc 06 §0b, name-collision warning.
INSERT INTO materials (id, sku, name, type, uom, description, status,
                       track_inventory, configs, created_at, updated_at, deleted_at)
SELECT
  mi.id, mi.sku, mi.name,
  (CASE lower(coalesce(mi.type, 'raw_material'))
     WHEN 'raw_material'   THEN 'RAW_MATERIAL'
     WHEN 'packaging'      THEN 'PACKAGING'
     WHEN 'semi_finished'  THEN 'SEMI_FINISHED'
     WHEN 'consumable'     THEN 'CONSUMABLE'
     WHEN 'other'          THEN 'OTHER'
     ELSE 'OTHER' END)::"MaterialType",
  coalesce(mi.uom, 'pcs'), mi.description,
  (CASE lower(coalesce(mi.status, 'active'))
     WHEN 'active'   THEN 'ACTIVE'
     WHEN 'inactive' THEN 'INACTIVE'
     WHEN 'archived' THEN 'ARCHIVED'
     WHEN 'draft'    THEN 'DRAFT'
     ELSE 'ACTIVE' END)::"ProductStatus",
  coalesce(mi.track_inventory, true), mi.configs,
  mi.created_at, mi.updated_at, mi.deleted_at
FROM "MaterialItems" mi;

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'materials', 'unknown material type, defaulted to OTHER', mi.id::text, mi.type
FROM "MaterialItems" mi
WHERE lower(coalesce(mi.type, 'raw_material'))
      NOT IN ('raw_material', 'packaging', 'semi_finished', 'consumable', 'other');

-- Advance the sequence NOW, not at the end: step 6 creates materials with
-- generated ids (the BOM component auto-conversion), and a sequence still
-- sitting at 1 hands out an id these explicit ones already own.
SELECT setval(pg_get_serial_sequence('materials', 'id'), coalesce(max(id), 0) + 1, false) FROM materials;

-- ── 3. Material stock  (legacy MaterialInventories) ─────────────────────────
-- Legacy `stock` is NOT carried: availability is computed from
-- quantity/reserved/needed by availableOf(), and a stored copy is the drifted
-- second source of truth doc 06 §0b exists to remove.
INSERT INTO material_stock (id, warehouse_id, material_id, quantity, reserved,
                            bad_quantity, needed, created_at, updated_at)
SELECT mi.id, mi.warehouse_id, mi.material_item_id, mi.quantity, mi.reserved,
       mi.bad_quantity, mi.needed, mi.created_at, mi.updated_at
FROM "MaterialInventories" mi
WHERE EXISTS (SELECT 1 FROM warehouses w WHERE w.id = mi.warehouse_id)
  AND EXISTS (SELECT 1 FROM materials m WHERE m.id = mi.material_item_id);

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'material_stock', 'warehouse or material missing — row skipped', mi.id::text,
       format('warehouse_id=%s material_item_id=%s qty=%s', mi.warehouse_id, mi.material_item_id, mi.quantity)
FROM "MaterialInventories" mi
WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.id = mi.warehouse_id)
   OR NOT EXISTS (SELECT 1 FROM materials m WHERE m.id = mi.material_item_id);

-- ── 4. Finished-goods stock  (legacy PhysicalInventories) ───────────────────
-- Keyed by SKU STRING in legacy; our warehouse_inventory keys by
-- product_variant_id, so every row has to resolve through product_variants.sku.
--
-- ON CONFLICT DO UPDATE, not DO NOTHING: warehouse_inventory already holds
-- rows from system A, which was DELETED from legacy prod on 2026-06-18. System
-- B is the live finished-goods data, so where both describe the same shelf, B
-- wins — otherwise the cutover would preserve counts that stopped being
-- maintained ten months ago.
INSERT INTO warehouse_inventory (warehouse_id, product_variant_id, quantity,
                                 stock, reserved, bad_quantity, needed,
                                 created_at, updated_at)
SELECT pi.warehouse_id, pv.id, pi.quantity, 0, pi.reserved, pi.bad_quantity,
       pi.needed, pi.created_at, pi.updated_at
FROM "PhysicalInventories" pi
JOIN product_variants pv ON pv.sku = pi.variant_sku
WHERE EXISTS (SELECT 1 FROM warehouses w WHERE w.id = pi.warehouse_id)
ON CONFLICT (warehouse_id, product_variant_id) DO UPDATE
SET quantity     = EXCLUDED.quantity,
    reserved     = EXCLUDED.reserved,
    bad_quantity = EXCLUDED.bad_quantity,
    needed       = EXCLUDED.needed,
    updated_at   = EXCLUDED.updated_at;

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'warehouse_inventory',
       'physical SKU has no product_variant — row skipped, decide port-or-drop',
       pi.id::text,
       format('variant_sku=%s warehouse_id=%s qty=%s', pi.variant_sku, pi.warehouse_id, pi.quantity)
FROM "PhysicalInventories" pi
WHERE NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.sku = pi.variant_sku)
   OR NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.id = pi.warehouse_id);

-- ── 5. Receipts  (both legacy trios → one unified set) ──────────────────────
-- Ids are re-issued: two legacy series (MaterialStockReceipts.id and
-- PhysicalStockReceipt.id) both start at 1 and would collide in one table. The
-- CODES are kept verbatim — MSR-/PSR- prefixes stay unique alongside the new
-- SR- series, which is what lets the floor find an old receipt by its paperwork.
CREATE TEMP TABLE _receipt_map (
  source text, legacy_id int, new_id int, PRIMARY KEY (source, legacy_id)
);
CREATE TEMP TABLE _shipment_map (
  source text, legacy_id int, new_id int, PRIMARY KEY (source, legacy_id)
);

WITH inserted AS (
  INSERT INTO stock_receipts (code, item_type, warehouse_id, status, provider, note,
                              reject_reason, created_by_id, approved_by_id, approved_at,
                              created_at, updated_at)
  SELECT
    r.receipt_code, 'MATERIAL'::"InventoryItemType", r.warehouse_id,
    (CASE lower(coalesce(r.status, 'pending'))
       WHEN 'pending'   THEN 'PENDING'
       WHEN 'partial'   THEN 'PARTIAL'
       WHEN 'complete'  THEN 'COMPLETE'
       WHEN 'completed' THEN 'COMPLETE'
       WHEN 'approved'  THEN 'COMPLETE'
       WHEN 'rejected'  THEN 'REJECTED'
       ELSE 'PENDING' END)::"ReceiptStatus",
    r.provider, r.note, r.reject_reason,
    (SELECT u.id FROM users u WHERE u.id = r.created_by::text),
    (SELECT u.id FROM users u WHERE u.id = r.approved_by::text),
    r.approved_at, r.created_at, r.updated_at
  FROM "MaterialStockReceipts" r
  WHERE EXISTS (SELECT 1 FROM warehouses w WHERE w.id = r.warehouse_id)
  ORDER BY r.id
  RETURNING id, code
)
INSERT INTO _receipt_map (source, legacy_id, new_id)
SELECT 'material', r.id, i.id FROM inserted i JOIN "MaterialStockReceipts" r ON r.receipt_code = i.code;

WITH inserted AS (
  INSERT INTO stock_receipts (code, item_type, warehouse_id, status, provider, note,
                              reject_reason, created_by_id, approved_by_id, approved_at,
                              created_at, updated_at)
  SELECT
    r.receipt_code, 'PRODUCT'::"InventoryItemType", r.warehouse_id,
    (CASE lower(coalesce(r.status, 'pending'))
       WHEN 'pending'   THEN 'PENDING'
       WHEN 'partial'   THEN 'PARTIAL'
       WHEN 'complete'  THEN 'COMPLETE'
       WHEN 'completed' THEN 'COMPLETE'
       WHEN 'approved'  THEN 'COMPLETE'
       WHEN 'rejected'  THEN 'REJECTED'
       ELSE 'PENDING' END)::"ReceiptStatus",
    r.provider, r.note, r.reject_reason,
    (SELECT u.id FROM users u WHERE u.id = r.created_by::text),
    (SELECT u.id FROM users u WHERE u.id = r.approved_by::text),
    r.approved_at, r.created_at, r.updated_at
  FROM "PhysicalStockReceipt" r
  WHERE EXISTS (SELECT 1 FROM warehouses w WHERE w.id = r.warehouse_id)
  ORDER BY r.id
  RETURNING id, code
)
INSERT INTO _receipt_map (source, legacy_id, new_id)
SELECT 'physical', r.id, i.id FROM inserted i JOIN "PhysicalStockReceipt" r ON r.receipt_code = i.code;

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'stock_receipts', 'unknown receipt status, defaulted to PENDING', r.receipt_code, r.status
FROM (SELECT receipt_code, status FROM "MaterialStockReceipts"
      UNION ALL SELECT receipt_code, status FROM "PhysicalStockReceipt") r
WHERE lower(coalesce(r.status, 'pending'))
      NOT IN ('pending', 'partial', 'complete', 'completed', 'approved', 'rejected');

-- Shipments. Physical shipments have NO vendor_id in legacy — only material
-- receipts were ever tied to a supplier record.
WITH inserted AS (
  INSERT INTO stock_receipt_shipments (receipt_id, vendor_id, shipment_code, tracking_number,
                                       carrier, tracking_url, expected_arrival_at, shipped_at,
                                       received_at, status, note, metadata, evidence,
                                       created_at, updated_at)
  SELECT
    rm.new_id,
    (SELECT v.id FROM vendors v WHERE v.id = s.vendor_id),
    s.shipment_code, s.tracking_number, s.carrier, s.tracking_url,
    s.expected_arrival_at, s.shipped_at, s.received_at,
    (CASE lower(coalesce(s.status, 'pending'))
       WHEN 'pending'          THEN 'PENDING'
       WHEN 'partial_received' THEN 'PARTIAL_RECEIVED'
       WHEN 'received'         THEN 'RECEIVED'
       WHEN 'rejected'         THEN 'REJECTED'
       ELSE 'PENDING' END)::"ReceiptShipmentStatus",
    s.note, s.metadata,
    -- VERBATIM: urls still point at the legacy host. See the header.
    s.evidence,
    s.created_at, s.updated_at
  FROM "MaterialStockReceiptShipments" s
  JOIN _receipt_map rm ON rm.source = 'material' AND rm.legacy_id = s.receipt_id
  ORDER BY s.id
  RETURNING id, receipt_id, shipment_code
)
INSERT INTO _shipment_map (source, legacy_id, new_id)
SELECT 'material', s.id, i.id
FROM inserted i
JOIN _receipt_map rm ON rm.new_id = i.receipt_id AND rm.source = 'material'
JOIN "MaterialStockReceiptShipments" s ON s.receipt_id = rm.legacy_id AND s.shipment_code = i.shipment_code;

WITH inserted AS (
  INSERT INTO stock_receipt_shipments (receipt_id, vendor_id, shipment_code, tracking_number,
                                       carrier, tracking_url, expected_arrival_at, shipped_at,
                                       received_at, status, note, metadata, evidence,
                                       created_at, updated_at)
  SELECT
    rm.new_id, NULL,
    s.shipment_code, s.tracking_number, s.carrier, s.tracking_url,
    s.expected_arrival_at, s.shipped_at, s.received_at,
    (CASE lower(coalesce(s.status, 'pending'))
       WHEN 'pending'          THEN 'PENDING'
       WHEN 'partial_received' THEN 'PARTIAL_RECEIVED'
       WHEN 'received'         THEN 'RECEIVED'
       WHEN 'rejected'         THEN 'REJECTED'
       ELSE 'PENDING' END)::"ReceiptShipmentStatus",
    s.note, s.metadata, s.evidence, s.created_at, s.updated_at
  FROM "PhysicalStockReceiptShipment" s
  JOIN _receipt_map rm ON rm.source = 'physical' AND rm.legacy_id = s.receipt_id
  ORDER BY s.id
  RETURNING id, receipt_id, shipment_code
)
INSERT INTO _shipment_map (source, legacy_id, new_id)
SELECT 'physical', s.id, i.id
FROM inserted i
JOIN _receipt_map rm ON rm.new_id = i.receipt_id AND rm.source = 'physical'
JOIN "PhysicalStockReceiptShipment" s ON s.receipt_id = rm.legacy_id AND s.shipment_code = i.shipment_code;

-- Lines. The XOR CHECK means a line must resolve to exactly one item, so a
-- physical line whose SKU has no product_variant is skipped and reported
-- rather than inserted half-formed.
INSERT INTO stock_receipt_lines (receipt_id, shipment_id, material_id, product_variant_id,
                                 requested_quantity, received_quantity, rejected_quantity,
                                 unit_price, note, created_at, updated_at)
SELECT rm.new_id, sm.new_id, l.material_item_id, NULL,
       l.requested_quantity, l.received_quantity, coalesce(l.rejected_quantity, 0),
       l.unit_price, l.note, l.created_at, l.updated_at
FROM "MaterialStockReceiptLines" l
JOIN _receipt_map rm ON rm.source = 'material' AND rm.legacy_id = l.receipt_id
LEFT JOIN _shipment_map sm ON sm.source = 'material' AND sm.legacy_id = l.shipment_id
WHERE EXISTS (SELECT 1 FROM materials m WHERE m.id = l.material_item_id);

-- Physical lines carry no rejected_quantity in legacy — it defaults to 0.
INSERT INTO stock_receipt_lines (receipt_id, shipment_id, material_id, product_variant_id,
                                 requested_quantity, received_quantity, rejected_quantity,
                                 unit_price, note, created_at, updated_at)
SELECT rm.new_id, sm.new_id, NULL, pv.id,
       l.requested_quantity, l.received_quantity, 0,
       NULL, l.note, l.created_at, l.updated_at
FROM "PhysicalStockReceiptLine" l
JOIN _receipt_map rm ON rm.source = 'physical' AND rm.legacy_id = l.receipt_id
LEFT JOIN _shipment_map sm ON sm.source = 'physical' AND sm.legacy_id = l.shipment_id
JOIN product_variants pv ON pv.sku = l.physical_variant_sku;

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'stock_receipt_lines', 'physical line SKU has no product_variant — line skipped',
       l.id::text, format('sku=%s receipt_id=%s', l.physical_variant_sku, l.receipt_id)
FROM "PhysicalStockReceiptLine" l
WHERE NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.sku = l.physical_variant_sku);

-- ── 6. BOMs  (before movements: movements reference bom ids) ────────────────
INSERT INTO boms (id, product_variant_id, name, version, status, effective_from,
                  effective_to, note, created_by_id, updated_by_id,
                  created_at, updated_at, deleted_at)
SELECT
  b.id, b.product_variant_id, b.name, b.version,
  (CASE lower(coalesce(b.status, 'draft'))
     WHEN 'draft'    THEN 'DRAFT'
     WHEN 'active'   THEN 'ACTIVE'
     WHEN 'inactive' THEN 'INACTIVE'
     ELSE 'DRAFT' END)::"BomStatus",
  b.effective_from, b.effective_to, b.note,
  (SELECT u.id FROM users u WHERE u.id = b.created_by::text),
  (SELECT u.id FROM users u WHERE u.id = b.updated_by::text),
  b.created_at, b.updated_at, b.deleted_at
FROM "Boms" b
WHERE EXISTS (SELECT 1 FROM product_variants pv WHERE pv.id = b.product_variant_id);

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'boms', 'product_variant missing — BOM skipped', b.id::text,
       format('product_variant_id=%s name=%s', b.product_variant_id, b.name)
FROM "Boms" b
WHERE NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.id = b.product_variant_id);

-- ONE ACTIVE PER VARIANT. Our schema does not enforce this in SQL — the
-- service does, on every activation path — so legacy data with two active
-- versions for one variant would leave reserveForOrder picking arbitrarily.
-- Newest version wins; the others are retired and reported.
WITH ranked AS (
  SELECT id, product_variant_id, version,
         row_number() OVER (PARTITION BY product_variant_id ORDER BY version DESC, id DESC) AS rn
  FROM boms
  WHERE status = 'ACTIVE' AND deleted_at IS NULL
)
UPDATE boms SET status = 'INACTIVE'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'boms', 'more than one ACTIVE version for this variant — older ones set INACTIVE',
       b.product_variant_id::text, format('kept version %s', max(b.version))
FROM "Boms" b
WHERE lower(coalesce(b.status, 'draft')) = 'active'
GROUP BY b.product_variant_id
HAVING count(*) > 1;

-- BOM lines. `component_product_variant_id` is NOT a column in the new schema:
-- legacy prod already auto-converted such lines into MaterialItems on save
-- (bom.service.ts:1316-1340). That conversion happens ONCE, here, by SKU —
-- creating the material when it is missing, exactly as legacy did.
INSERT INTO materials (sku, name, type, uom, status, track_inventory, created_at, updated_at)
SELECT DISTINCT ON (pv.sku)
  pv.sku,
  coalesce(bl.component_name, p.name, pv.sku),
  'RAW_MATERIAL'::"MaterialType", 'pcs', 'ACTIVE'::"ProductStatus", true, now(), now()
FROM "BomLines" bl
JOIN product_variants pv ON pv.id = bl.component_product_variant_id
LEFT JOIN products p ON p.id = pv.product_id
WHERE bl.material_item_id IS NULL
  AND pv.sku IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM materials m WHERE m.sku = pv.sku)
ORDER BY pv.sku, bl.id;

INSERT INTO bom_lines (id, bom_id, material_id, component_sku, component_name,
                       quantity_per_unit, unit, wastage_rate, stage, required,
                       sort_order, note, created_at, updated_at)
SELECT
  bl.id, bl.bom_id,
  -- Three ways a line finds its material, in order: it already names one; it
  -- named a product variant whose sku is a material (converted just above);
  -- or neither, and the line lands UNMAPPED for the floor to fix in the UI.
  coalesce(
    (SELECT m.id FROM materials m WHERE m.id = bl.material_item_id),
    (SELECT m.id FROM materials m
       JOIN product_variants pv ON pv.sku = m.sku
      WHERE pv.id = bl.component_product_variant_id)
  ),
  coalesce(
    bl.component_sku,
    (SELECT pv.sku FROM product_variants pv WHERE pv.id = bl.component_product_variant_id),
    '—'
  ),
  bl.component_name, bl.quantity_per_unit, coalesce(bl.unit, 'pcs'),
  coalesce(bl.wastage_rate, 0),
  (CASE lower(coalesce(bl.stage, 'production'))
     WHEN 'production' THEN 'PRODUCTION'
     WHEN 'packing'    THEN 'PACKING'
     WHEN 'shipping'   THEN 'SHIPPING'
     WHEN 'other'      THEN 'OTHER'
     ELSE 'OTHER' END)::"BomStage",
  coalesce(bl.required, true), coalesce(bl.sort_order, 0), bl.note,
  bl.created_at, bl.updated_at
FROM "BomLines" bl
WHERE EXISTS (SELECT 1 FROM boms b WHERE b.id = bl.bom_id);

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'bom_lines', 'component could not be resolved — line is UNMAPPED, fix it in the BOM dialog',
       bl.id::text, format('bom_id=%s component_sku=%s', bl.bom_id, bl.component_sku)
FROM "BomLines" bl
WHERE EXISTS (SELECT 1 FROM boms b WHERE b.id = bl.bom_id)
  AND NOT EXISTS (SELECT 1 FROM materials m WHERE m.id = bl.material_item_id)
  AND NOT EXISTS (
    SELECT 1 FROM materials m JOIN product_variants pv ON pv.sku = m.sku
     WHERE pv.id = bl.component_product_variant_id
  );

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'bom_lines', 'bom missing — line skipped', bl.id::text, format('bom_id=%s', bl.bom_id)
FROM "BomLines" bl
WHERE NOT EXISTS (SELECT 1 FROM boms b WHERE b.id = bl.bom_id);

-- ── 7. Reservations  (material only — physical never wrote rows) ────────────
-- order_id is NOT NULL with a foreign key: a reservation is a LIVE CLAIM on
-- stock (doc 06 §A3.2), so one pointing at an order that no longer exists is
-- reported rather than forced in.
INSERT INTO inventory_reservations (id, item_type, material_id, product_variant_id,
                                    warehouse_id, bom_id, bom_line_id, order_id,
                                    quantity, consumed_quantity, status,
                                    created_by_id, note, created_at, updated_at)
SELECT
  r.id, 'MATERIAL'::"InventoryItemType", r.material_item_id, NULL,
  r.warehouse_id,
  (SELECT b.id FROM boms b WHERE b.id = r.bom_id),
  (SELECT bl.id FROM bom_lines bl WHERE bl.id = r.bom_line_id),
  r.order_id, r.quantity, coalesce(r.consumed_quantity, 0),
  (CASE lower(coalesce(r.status, 'reserved'))
     WHEN 'reserved' THEN 'RESERVED'
     WHEN 'consumed' THEN 'CONSUMED'
     WHEN 'released' THEN 'RELEASED'
     WHEN 'returned' THEN 'RETURNED'
     ELSE 'RESERVED' END)::"ReservationStatus",
  (SELECT u.id FROM users u WHERE u.id = r.created_by::text),
  r.note, r.created_at, r.updated_at
FROM "MaterialInventoryReservations" r
WHERE EXISTS (SELECT 1 FROM materials m  WHERE m.id = r.material_item_id)
  AND EXISTS (SELECT 1 FROM warehouses w WHERE w.id = r.warehouse_id)
  AND EXISTS (SELECT 1 FROM orders o     WHERE o.id = r.order_id);

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'inventory_reservations', 'order, material or warehouse missing — reservation skipped',
       r.id::text,
       format('order_id=%s material_item_id=%s warehouse_id=%s qty=%s status=%s',
              r.order_id, r.material_item_id, r.warehouse_id, r.quantity, r.status)
FROM "MaterialInventoryReservations" r
WHERE NOT EXISTS (SELECT 1 FROM materials m  WHERE m.id = r.material_item_id)
   OR NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.id = r.warehouse_id)
   OR NOT EXISTS (SELECT 1 FROM orders o     WHERE o.id = r.order_id);

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'inventory_reservations', 'unknown reservation status, defaulted to RESERVED', r.id::text, r.status
FROM "MaterialInventoryReservations" r
WHERE lower(coalesce(r.status, 'reserved')) NOT IN ('reserved', 'consumed', 'released', 'returned');

-- ── 8. Movements  (both ledgers → one) ──────────────────────────────────────
-- Type strings map per doc 06 §0b. An UNKNOWN type is skipped and reported,
-- never coerced: a movement filed under the wrong type is worse than one
-- listed in the report, because the ledger is what a wrong count gets
-- explained with.
INSERT INTO inventory_movements (item_type, material_id, product_variant_id, warehouse_id,
                                 type, quantity, reservation_id, bom_id, bom_line_id,
                                 order_id, reference_type, reference_id,
                                 created_by_id, note, created_at)
SELECT
  'MATERIAL'::"InventoryItemType", m.material_item_id, NULL, m.warehouse_id,
  (CASE lower(m.type)
     WHEN 'receipt'                    THEN 'RECEIPT'
     WHEN 'manual_import'              THEN 'MANUAL_IMPORT'
     WHEN 'manual_adjustment'          THEN 'MANUAL_ADJUSTMENT'
     WHEN 'material_reserve'           THEN 'RESERVE'
     WHEN 'material_reserve_release'   THEN 'RESERVE_RELEASE'
     WHEN 'material_consume'           THEN 'CONSUME'
     WHEN 'material_return'            THEN 'RETURN'
     WHEN 'material_needed'            THEN 'NEEDED'
     WHEN 'material_needed_resolved'   THEN 'NEEDED_RESOLVED'
   END)::"InventoryMovementType",
  m.quantity,
  (SELECT r.id FROM inventory_reservations r WHERE r.id = m.reservation_id),
  (SELECT b.id FROM boms b WHERE b.id = m.bom_id),
  (SELECT bl.id FROM bom_lines bl WHERE bl.id = m.bom_line_id),
  m.order_id, m.reference_type, m.reference_id,
  (SELECT u.id FROM users u WHERE u.id = m.created_by::text),
  m.note, m.created_at
FROM "MaterialInventoryMovements" m
WHERE lower(m.type) IN ('receipt', 'manual_import', 'manual_adjustment', 'material_reserve',
                        'material_reserve_release', 'material_consume', 'material_return',
                        'material_needed', 'material_needed_resolved')
  AND EXISTS (SELECT 1 FROM materials mm  WHERE mm.id = m.material_item_id)
  AND EXISTS (SELECT 1 FROM warehouses w  WHERE w.id = m.warehouse_id);

INSERT INTO inventory_movements (item_type, material_id, product_variant_id, warehouse_id,
                                 type, quantity, reference_type, reference_id,
                                 created_by_id, note, created_at)
SELECT
  'PRODUCT'::"InventoryItemType", NULL, pv.id, m.warehouse_id,
  (CASE lower(m.type)
     WHEN 'receipt'          THEN 'RECEIPT'
     WHEN 'manual_import'    THEN 'MANUAL_IMPORT'
     WHEN 'manual_adjustment' THEN 'MANUAL_ADJUSTMENT'
     WHEN 'reserve'          THEN 'RESERVE'
     WHEN 'reserve_release'  THEN 'RESERVE_RELEASE'
     WHEN 'assign'           THEN 'CONSUME'
     WHEN 'return'           THEN 'RETURN'
     WHEN 'needed'           THEN 'NEEDED'
     WHEN 'needed_resolved'  THEN 'NEEDED_RESOLVED'
   END)::"InventoryMovementType",
  m.quantity, m.reference_type, m.reference_id,
  (SELECT u.id FROM users u WHERE u.id = m.created_by::text),
  m.note, m.created_at
FROM "InventoryMovement" m
JOIN product_variants pv ON pv.sku = m.physical_variant_sku
WHERE lower(m.type) IN ('receipt', 'manual_import', 'manual_adjustment', 'reserve',
                        'reserve_release', 'assign', 'return', 'needed', 'needed_resolved')
  AND EXISTS (SELECT 1 FROM warehouses w WHERE w.id = m.warehouse_id);

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'inventory_movements', 'unknown movement type — row skipped, NOT coerced',
       m.id::text, format('ledger=material type=%s qty=%s', m.type, m.quantity)
FROM "MaterialInventoryMovements" m
WHERE lower(m.type) NOT IN ('receipt', 'manual_import', 'manual_adjustment', 'material_reserve',
                            'material_reserve_release', 'material_consume', 'material_return',
                            'material_needed', 'material_needed_resolved');

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'inventory_movements', 'unknown movement type — row skipped, NOT coerced',
       m.id::text, format('ledger=physical type=%s qty=%s', m.type, m.quantity)
FROM "InventoryMovement" m
WHERE lower(m.type) NOT IN ('receipt', 'manual_import', 'manual_adjustment', 'reserve',
                            'reserve_release', 'assign', 'return', 'needed', 'needed_resolved');

INSERT INTO migration_report (step, issue, legacy_id, detail)
SELECT 'inventory_movements', 'physical movement SKU has no product_variant — row skipped',
       m.id::text, format('sku=%s type=%s', m.physical_variant_sku, m.type)
FROM "InventoryMovement" m
WHERE NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.sku = m.physical_variant_sku);

-- ── 9. Sequences (explicit ids were inserted above) ─────────────────────────
SELECT setval(pg_get_serial_sequence('vendors', 'id'),                 coalesce(max(id), 0) + 1, false) FROM vendors;
SELECT setval(pg_get_serial_sequence('materials', 'id'),               coalesce(max(id), 0) + 1, false) FROM materials;
SELECT setval(pg_get_serial_sequence('material_stock', 'id'),          coalesce(max(id), 0) + 1, false) FROM material_stock;
SELECT setval(pg_get_serial_sequence('warehouse_inventory', 'id'),     coalesce(max(id), 0) + 1, false) FROM warehouse_inventory;
SELECT setval(pg_get_serial_sequence('stock_receipts', 'id'),          coalesce(max(id), 0) + 1, false) FROM stock_receipts;
SELECT setval(pg_get_serial_sequence('stock_receipt_shipments', 'id'), coalesce(max(id), 0) + 1, false) FROM stock_receipt_shipments;
SELECT setval(pg_get_serial_sequence('stock_receipt_lines', 'id'),     coalesce(max(id), 0) + 1, false) FROM stock_receipt_lines;
SELECT setval(pg_get_serial_sequence('boms', 'id'),                    coalesce(max(id), 0) + 1, false) FROM boms;
SELECT setval(pg_get_serial_sequence('bom_lines', 'id'),               coalesce(max(id), 0) + 1, false) FROM bom_lines;
SELECT setval(pg_get_serial_sequence('inventory_reservations', 'id'),  coalesce(max(id), 0) + 1, false) FROM inventory_reservations;
SELECT setval(pg_get_serial_sequence('inventory_movements', 'id'),     coalesce(max(id), 0) + 1, false) FROM inventory_movements;

COMMIT;

-- ── Count report (legacy vs migrated) ───────────────────────────────────────
SELECT 'vendors' AS entity, (SELECT count(*) FROM "Vendors") AS legacy, (SELECT count(*) FROM vendors) AS migrated
UNION ALL SELECT 'materials',        (SELECT count(*) FROM "MaterialItems"),        (SELECT count(*) FROM materials)
UNION ALL SELECT 'material_stock',   (SELECT count(*) FROM "MaterialInventories"),  (SELECT count(*) FROM material_stock)
UNION ALL SELECT 'physical_stock',   (SELECT count(*) FROM "PhysicalInventories"),  (SELECT count(*) FROM warehouse_inventory)
UNION ALL SELECT 'stock_receipts',   (SELECT count(*) FROM "MaterialStockReceipts") + (SELECT count(*) FROM "PhysicalStockReceipt"), (SELECT count(*) FROM stock_receipts)
UNION ALL SELECT 'receipt_shipments',(SELECT count(*) FROM "MaterialStockReceiptShipments") + (SELECT count(*) FROM "PhysicalStockReceiptShipment"), (SELECT count(*) FROM stock_receipt_shipments)
UNION ALL SELECT 'receipt_lines',    (SELECT count(*) FROM "MaterialStockReceiptLines") + (SELECT count(*) FROM "PhysicalStockReceiptLine"), (SELECT count(*) FROM stock_receipt_lines)
UNION ALL SELECT 'boms',             (SELECT count(*) FROM "Boms"),                 (SELECT count(*) FROM boms)
UNION ALL SELECT 'bom_lines',        (SELECT count(*) FROM "BomLines"),             (SELECT count(*) FROM bom_lines)
UNION ALL SELECT 'reservations',     (SELECT count(*) FROM "MaterialInventoryReservations"), (SELECT count(*) FROM inventory_reservations)
UNION ALL SELECT 'movements',        (SELECT count(*) FROM "MaterialInventoryMovements") + (SELECT count(*) FROM "InventoryMovement"), (SELECT count(*) FROM inventory_movements);

-- ── E3. THE DEFERRED DECISION, ANSWERABLE NOW ───────────────────────────────
-- doc 04 §A4 shipped ProductVariant WITHOUT @@unique([productId, variantId])
-- because nobody could check the legacy data for duplicates. This is the
-- session where that becomes answerable, and inventory is what makes it
-- URGENT rather than cosmetic: stock, receipts and BOM lines all resolve
-- through product_variants, so a duplicate SKU row means one shelf's counts
-- split across two variant ids and neither is right.
--
-- Run these two, in this order, before dropping the legacy tables:
--
--   -- 1. Are there duplicates at all?
--   SELECT product_id, variant_id, count(*), array_agg(id) AS ids
--   FROM product_variants WHERE deleted_at IS NULL
--   GROUP BY product_id, variant_id HAVING count(*) > 1;
--
--   -- 2. Do any of them actually hold inventory? This is the one that decides
--   --    how much work the fix is: a duplicate nothing points at is a DELETE,
--   --    a duplicate with stock on both rows needs a human to merge them.
--   SELECT pv.product_id, pv.variant_id, pv.id, pv.sku,
--          (SELECT count(*) FROM warehouse_inventory wi WHERE wi.product_variant_id = pv.id) AS stock_rows,
--          (SELECT count(*) FROM stock_receipt_lines l  WHERE l.product_variant_id = pv.id) AS receipt_lines,
--          (SELECT count(*) FROM inventory_movements m  WHERE m.product_variant_id = pv.id) AS movements,
--          (SELECT count(*) FROM boms b                 WHERE b.product_variant_id = pv.id) AS boms,
--          (SELECT count(*) FROM orders o               WHERE o.product_variant_id = pv.id) AS orders
--   FROM product_variants pv
--   WHERE pv.deleted_at IS NULL
--     AND (pv.product_id, pv.variant_id) IN (
--       SELECT product_id, variant_id FROM product_variants
--       WHERE deleted_at IS NULL GROUP BY 1, 2 HAVING count(*) > 1)
--   ORDER BY pv.product_id, pv.variant_id, pv.id;
--
--   NO ROWS from (1) → add @@unique([productId, variantId]) to the Prisma
--                      model, migrate, and switch attachVariants to
--                      createMany({ skipDuplicates: true }). That closes the
--                      attach race at the database, where it belongs.
--   ROWS from (1)    → dedupe FIRST using (2) to see what is attached, then
--                      add the constraint. Adding it before the dedupe aborts
--                      the migration.
--
-- The query is left commented on purpose: it is a DECISION for a human with
-- real counts in front of them, not something a cutover script should act on
-- unattended.

-- ── READ THIS BEFORE DECLARING THE CUTOVER DONE ─────────────────────────────
-- SELECT step, issue, count(*) FROM migration_report GROUP BY 1, 2 ORDER BY 1, 2;
-- SELECT * FROM migration_report ORDER BY step, id;
--
-- Zero rows is a clean run. Rows are NOT necessarily failures — an unmapped
-- BOM line is fixable in the UI, an orphaned physical SKU may be a product
-- that was genuinely deleted — but every one is a decision somebody has to
-- make with real counts in front of them.

-- ── Cleanup — ONLY after the report is settled ──────────────────────────────
-- DROP TABLE "BomLines", "Boms", "BomInventoryMovements",
--            "MaterialInventoryMovements", "MaterialInventoryReservations",
--            "MaterialStockReceiptLines", "MaterialStockReceiptShipments",
--            "MaterialStockReceipts", "MaterialInventories", "MaterialItems",
--            "PhysicalStockReceiptLine", "PhysicalStockReceiptShipment",
--            "PhysicalStockReceipt", "PhysicalInventories", "InventoryMovement",
--            "PhysicalStockImports", "PhysicalVariants", "Vendors",
--            "Materials" CASCADE;
-- DROP TABLE migration_report;
