-- ============================================================================
-- Legacy fixture — synthetic "old system" tables for rehearsing the cutover.
-- ============================================================================
-- Loaded into a scratch database by run-cutover-test.sh, which then runs
-- migrate-legacy.sql against it. Column names and types mirror the archived
-- legacy backend schema (.archive/oldproject/fulfillment-system-be).
--
-- SCOPE: only the tables and columns migrate-legacy.sql actually reads. No
-- foreign keys or NOT NULLs — this is a fixture, not a faithful rebuild; its
-- job is to exercise the cutover's logic.
--
-- LIMIT (read this before trusting a green run): the archived legacy schema is
-- roughly 10 months behind the legacy production database, so a passing run
-- proves the script is SELF-CONSISTENT, not that it matches real prod data. A
-- rehearsal against a real pg_dump is still required before the live cutover.
--
-- Rows are chosen to hit the awkward paths, not to look realistic: duplicate
-- warehouse names, a name with no alphanumerics, every legacy role string,
-- allow-lists containing ids that no longer exist, null configs, unknown enum
-- strings, and orders assigned to a warehouse-role user.
-- ============================================================================

DROP TABLE IF EXISTS "Warehouse", "Users", "Products", "Variants",
  "ProductVariants", "Mockups", "BasketPosition", "Orders",
  "WarehouseInventory", "StockImport", "ImportMovement", "Ticket",
  "TopupTransaction", "AppConfig" CASCADE;

-- ── Warehouses ──────────────────────────────────────────────────────────────
CREATE TABLE "Warehouse" (
  id int PRIMARY KEY, display_name text, address text, city text, state text,
  zipcode text, country text, status text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "Warehouse" (id, display_name, address, city, state, zipcode, country, status) VALUES
  (1, 'Ho Chi Minh Main', '12 Le Loi', 'Ho Chi Minh', 'HCM', '70000', 'VN', 'active'),
  -- Same display name as #1: the generated `code` must still be unique.
  (2, 'Ho Chi Minh Main', '99 Nguyen Hue', 'Ho Chi Minh', 'HCM', '70000', 'VN', 'inactive'),
  -- No alphanumerics at all: must fall back to the WH-<id> form.
  (3, '!!! ???', NULL, NULL, NULL, NULL, NULL, 'weird-unknown-status');

-- ── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE "Users" (
  id int PRIMARY KEY, display_name text, username text, email text,
  password text, phone text, status text, roles text[], tier int,
  balance numeric, debt numeric, webhook_url text, webhook_key text,
  configs jsonb, last_login timestamp, warehouse_id int,
  api_key text, api_key_created_at timestamp, api_key_last_used_at timestamp,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
  deleted_at timestamp
);
INSERT INTO "Users" (id, display_name, username, email, password, phone, status, roles,
                     tier, balance, debt, configs, warehouse_id, api_key) VALUES
  (1, 'Root Admin',   'admin',    'admin@old.test',    '$2a$hash1', '+84900000001', 'active',   '{admin}',              NULL, 0,     0, NULL, NULL, 'legacy-key-admin'),
  (2, 'Big Seller',   'seller1',  'seller@old.test',   '$2a$hash2', '+84900000002', 'active',   '{customer}',           2,    150.75, 0, NULL, NULL, NULL),
  -- Every role that the old ELSE branch silently flattened to SELLER.
  (3, 'Support Staff','support1', 'support@old.test',  '$2a$hash3', '+84900000003', 'active',   '{supporter}',          NULL, 0,     0, NULL, NULL, NULL),
  (4, 'WH Manager',   'whadmin',  'whadmin@old.test',  '$2a$hash4', '+84900000004', 'active',   '{warehouse_admin}',    NULL, 0,     0, NULL, 1,    NULL),
  (5, 'Designer Dan', 'designer1','designer@old.test', '$2a$hash5', '+84900000005', 'active',   '{designer}',           NULL, 0,     0, NULL, NULL, NULL),
  -- Restricted partner: becomes WAREHOUSE + user_allowed_products rows.
  -- Product 999 does not exist and must be dropped, not fail the cutover.
  (6, 'Ext Partner',  'ext1',     'ext@old.test',      '$2a$hash6', '+84900000006', 'active',   '{warehouse_external}', NULL, 0,     0, '{"products": [10, 20, 999], "ui": {"theme": "dark"}}'::jsonb, 2, NULL),
  (7, 'Warehouse Op', 'wh1',      'wh@old.test',       '$2a$hash7', '+84900000007', 'active',   '{warehouse}',          NULL, 0,     0, NULL, 1,    NULL),
  -- Unknown role + banned + soft-deleted + a non-array configs.products.
  (8, 'Odd One',      'odd1',     'odd@old.test',      '$2a$hash8', NULL,           'banned',   '{some_future_role}',   NULL, -5.25, 12.50, '{"products": "not-an-array"}'::jsonb, NULL, NULL),
  (9, 'Multi Role',   'multi1',   'multi@old.test',    '$2a$hash9', '+84900000009', 'inactive', '{admin,supporter}',    NULL, 0,     0, '{"products": []}'::jsonb, NULL, 'legacy-key-multi');
UPDATE "Users" SET deleted_at = now() WHERE id = 8;

-- ── Catalog ─────────────────────────────────────────────────────────────────
CREATE TABLE "Products" (
  id int PRIMARY KEY, display_name text, key text, thumbnails text, status text,
  configs jsonb, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
  deleted_at timestamp
);
INSERT INTO "Products" (id, display_name, key, thumbnails, status) VALUES
  (10, 'Leather Wallet', 'leather-wallet', 'https://cdn/x.png', 'active'),
  (20, 'Canvas Tote',    'canvas-tote',    NULL,                'draft'),
  (30, 'Retired Mug',    'retired-mug',    NULL,                'nonsense-status');

CREATE TABLE "Variants" (
  id int PRIMARY KEY, display_name text, key text, status text, data jsonb,
  configs jsonb, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
  deleted_at timestamp
);
INSERT INTO "Variants" (id, display_name, key, status) VALUES
  (100, 'Black / Large', 'black-large', 'active'),
  (200, 'Brown / Small', 'brown-small', 'archived');

CREATE TABLE "ProductVariants" (
  id int PRIMARY KEY, product_id int, variant_id int, sku text, stock int,
  needed int, sale_price numeric, position int, configs jsonb, data jsonb,
  deleted_at timestamp, price numeric,
  price_tier_1 numeric, price_tier_2 numeric, price_tier_3 numeric, price_tier_4 numeric
);
INSERT INTO "ProductVariants" (id, product_id, variant_id, sku, stock, needed, sale_price,
                               position, price, price_tier_1, price_tier_2, price_tier_3, price_tier_4) VALUES
  -- All tiers set → 5 variant_prices rows.
  (1000, 10, 100, 'LW-BL-L', 25, 0, 30.00, 1, 12.50, 12.00, 11.50, 11.00, 10.50),
  -- Only the base price → exactly 1 variant_prices row (tiers are 0/NULL).
  (2000, 20, 200, 'CT-BR-S', 0,  5, 18.00, 2, 9.00,  0,     0,     NULL,  NULL);

CREATE TABLE "Mockups" (
  id int PRIMARY KEY, display_name text, thumbnails text, url text, folder_id text,
  status text, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "Mockups" (id, display_name, thumbnails, url, folder_id, status) VALUES
  (500, 'Wallet Front', 'https://cdn/m1.png', 'https://cdn/m1-full.png', 'folder-a', 'active');

-- ── Basket positions ────────────────────────────────────────────────────────
CREATE TABLE "BasketPosition" (
  id int PRIMARY KEY, display_name text, shelf_name text, tracking_number text,
  "row" int, "column" int, level int, status text, note text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "BasketPosition" (id, display_name, shelf_name, tracking_number, "row", "column", level, status) VALUES
  (7000, 'A-01-01', 'Shelf A', 'TRK1000000001', 1, 1, 1, 'occupied'),
  (7001, 'A-01-02', 'Shelf A', NULL,            1, 2, 1, 'break');

-- ── Orders ──────────────────────────────────────────────────────────────────
CREATE TABLE "Orders" (
  id int PRIMARY KEY, order_id text, marketplace text, source text, seller text,
  customer_id int, warehouse_id int, product_id int, variant_id int,
  product_variant_id int, mockup_id int, quantity int, filled int,
  warehouse_status text, order_date timestamp, assigned_at timestamp,
  fulfilled_at timestamp, deadline timestamp, paid int,
  base_cost numeric, fee numeric, revenue numeric, profit numeric,
  note text, warehouse_note text, order_image text, configs jsonb,
  leather_shape text, product_type text, month text, basket_position text,
  variants text[],
  shipping_name text, shipping_company text, shipping_email text,
  shipping_address text, shipping_address_line_2 text, shipping_city text,
  shipping_state text, shipping_zipcode text, shipping_country text,
  shipping_provider text, shipping_method text, shipping_cost numeric,
  tracking_number text, tracking_status text, label_url text,
  label_downloaded_path text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
  deleted_at timestamp
);
-- Order 1: assigned to user 7 (a warehouse-role user in warehouse 1) — proves
-- assigned_to_id gets the USER and warehouse_id is dereferenced to the SITE.
-- Has shipping + tracking, so it produces an address and a shipment row.
INSERT INTO "Orders" (id, order_id, marketplace, source, seller, customer_id, warehouse_id,
                      product_id, variant_id, product_variant_id, mockup_id, quantity, filled,
                      warehouse_status, order_date, paid, base_cost, fee, revenue, profit,
                      basket_position, variants,
                      shipping_name, shipping_email, shipping_address, shipping_city,
                      shipping_state, shipping_zipcode, shipping_country,
                      shipping_provider, shipping_method, shipping_cost,
                      tracking_number, tracking_status, label_url) VALUES
  (900001, 'OP-1001', 'tiktok', 'api', 'seller@old.test', 2, 7,
   10, 100, 1000, 500, 3, 3,
   'processing', now() - interval '5 days', 1, 12.50, 1.00, 30.00, 16.50,
   'A-01-01', '{black,large}',
   'Jane Buyer', 'jane@buyer.test', '500 Main St', 'Austin',
   'TX', '73301', 'US',
   'usps', 'first_class', 4.25,
   'TRK1000000001', 'in_transit', 'https://labels/1.pdf');
-- Order 2: unassigned, unknown status string (must fall back to PENDING), no
-- shipping and no tracking — so NO address and NO shipment row.
INSERT INTO "Orders" (id, order_id, customer_id, warehouse_id, product_id, variant_id,
                      product_variant_id, quantity, filled, warehouse_status, order_date, paid,
                      base_cost) VALUES
  (900002, 'OP-1002', 2, NULL, 20, 200, 2000, 1, 0, 'totally-unknown', now(), 0, 9.00);

-- ── Inventory ───────────────────────────────────────────────────────────────
CREATE TABLE "WarehouseInventory" (
  id int PRIMARY KEY, warehouse_id int, product_variant_id int, quantity int,
  stock int, bad_quantity int, needed int
);
INSERT INTO "WarehouseInventory" (id, warehouse_id, product_variant_id, quantity, stock, bad_quantity, needed) VALUES
  (3000, 1, 1000, 25, 25, 1, 0),
  (3001, 2, 2000, 0,  0,  0, 5);

CREATE TABLE "StockImport" (
  id int PRIMARY KEY, product_variant_id int, warehouse_id int, quantity int,
  import_date timestamp, note text, provider text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "StockImport" (id, product_variant_id, warehouse_id, quantity, import_date, note, provider) VALUES
  (4000, 1000, 1, 50, now() - interval '30 days', 'initial stock', 'vendor-a');

CREATE TABLE "ImportMovement" (
  id int PRIMARY KEY, stock_import_id int, order_id text, quantity int,
  movement_type text, note text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "ImportMovement" (id, stock_import_id, order_id, quantity, movement_type, note) VALUES
  (5000, 4000, 'OP-1001', -3, 'out', 'fulfilled OP-1001');

-- ── Tickets ─────────────────────────────────────────────────────────────────
CREATE TABLE "Ticket" (
  id int PRIMARY KEY, display_name text, description text, reason text,
  status text, priority text, author_id int, order_id int,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "Ticket" (id, display_name, description, reason, status, priority, author_id, order_id) VALUES
  (6000, 'Wrong colour', 'Received brown, ordered black', 'wrong_item', 'processing', 'high',   2, 900001),
  (6001, 'Where is it?',  'No tracking updates',          'shipping',   'mystery',    'bogus',  2, NULL);

-- ── Transactions ────────────────────────────────────────────────────────────
CREATE TABLE "TopupTransaction" (
  id int PRIMARY KEY, transaction_id text, user_id int, amount numeric,
  type text, status text, payment_method text, description text, note text,
  balance_before numeric, balance_after numeric,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "TopupTransaction" (id, transaction_id, user_id, amount, type, status,
                                payment_method, description, balance_before, balance_after) VALUES
  (8000, 'TXN-0001', 2, 200.00, 'topup',   'success',       'bank',   'Wallet top up',   0.00,   200.00),
  (8001, 'TXN-0002', 2, -12.50, 'payment', 'completed',     'wallet', 'Order OP-1001',   200.00, 187.50),
  -- Null public id (must be generated) and unknown type/status (must fall back).
  (8002, NULL,       2, -36.75, 'mystery', 'weird-unknown', NULL,     'Unknown',         187.50, 150.75);

-- ── App config ──────────────────────────────────────────────────────────────
-- `value` is Json in legacy (and in the new schema), not text.
CREATE TABLE "AppConfig" (
  id int PRIMARY KEY, key text, value jsonb, description text,
  created_at timestamp, updated_at timestamp
);
INSERT INTO "AppConfig" (id, key, value, description) VALUES
  (9000, 'shipping.default_provider', '"usps"'::jsonb, 'Default carrier');

-- ============================================================================
-- LEGACY INVENTORY (systems B and C) — doc 06 phase E
-- ============================================================================
-- Table names mirror legacy EXACTLY, including its inconsistency: material
-- tables are plural (@@map), the four physical ones are singular (no @@map).
-- Getting that wrong is a cutover that aborts on table-not-found, so the
-- fixture is the thing that proves the script spelled them right.
--
-- Rows target the awkward paths doc 06 §E2 names, one per hazard.
-- ============================================================================

DROP TABLE IF EXISTS "Vendors", "MaterialItems", "MaterialInventories",
  "MaterialStockReceipts", "MaterialStockReceiptShipments", "MaterialStockReceiptLines",
  "MaterialInventoryMovements", "MaterialInventoryReservations",
  "PhysicalInventories", "PhysicalStockReceipt", "PhysicalStockReceiptShipment",
  "PhysicalStockReceiptLine", "InventoryMovement", "Boms", "BomLines", "Materials" CASCADE;

-- ── Vendors ─────────────────────────────────────────────────────────────────
CREATE TABLE "Vendors" (
  id int PRIMARY KEY, code text, name text, contact_name text, phone text,
  email text, address text, tax_code text, note text, status text,
  deleted_at timestamp, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "Vendors" (id, code, name, contact_name, status) VALUES
  (1, 'ACME',  'Acme Supplies',  'Ann',  'active'),
  -- Unknown status string must fall back, not abort.
  (2, 'GHOST', 'Ghost Trading',  NULL,   'weird-unknown');

-- ── The NAME COLLISION: legacy "Materials" is an ATTRIBUTE CATALOG ──────────
-- leather/canvas/wood for the never-rebuilt SKU/addon system. It must NOT be
-- migrated into `materials`; the assertions check nothing from here leaks in.
CREATE TABLE "Materials" (
  id int PRIMARY KEY, name text, status text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "Materials" (id, name, status) VALUES
  (1, 'Leather', 'active'),
  (2, 'Canvas',  'active'),
  (3, 'Wood',    'active');

-- ── Material items (the REAL raw materials) ─────────────────────────────────
CREATE TABLE "MaterialItems" (
  id int PRIMARY KEY, sku text, name text, type text, uom text, description text,
  status text, track_inventory boolean, configs jsonb,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), deleted_at timestamp
);
INSERT INTO "MaterialItems" (id, sku, name, type, uom, status, track_inventory) VALUES
  (1, 'MAT-LEATHER', 'Leather sheet', 'raw_material',  'm',    'active',   true),
  (2, 'MAT-BOX',     'Shipping box',  'packaging',     'pcs',  'active',   true),
  -- Unknown type must become OTHER and be reported, not abort.
  (3, 'MAT-WEIRD',   'Mystery stuff', 'unobtanium',    'kg',   'active',   true),
  -- Untracked: appears on BOMs, holds no stock.
  (4, 'MAT-GLUE',    'Glue',          'consumable',    'ml',   'active',   false);

CREATE TABLE "MaterialInventories" (
  id int PRIMARY KEY, warehouse_id int, material_item_id int, quantity int,
  stock int, reserved int, bad_quantity int, needed int,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "MaterialInventories" (id, warehouse_id, material_item_id, quantity, stock, reserved, bad_quantity, needed) VALUES
  (1, 1, 1, 100, 95, 5, 2, 0),
  (2, 1, 2, 40,  40, 0, 0, 3),
  -- Warehouse 99 does not exist: must be reported and skipped, not abort.
  (3, 99, 1, 7,  7,  0, 0, 0);

-- ── Physical (finished goods) stock ─────────────────────────────────────────
-- NOTE the column is `variant_sku` here but `physical_variant_sku` on the
-- receipt lines and the ledger. Legacy really is like this.
CREATE TABLE "PhysicalInventories" (
  id int PRIMARY KEY, warehouse_id int, variant_sku text, quantity int,
  stock int, reserved int, bad_quantity int, needed int,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "PhysicalInventories" (id, warehouse_id, variant_sku, quantity, stock, reserved, bad_quantity, needed) VALUES
  -- Matches ProductVariants 1000. System A already migrated a row for this
  -- shelf, and system B must WIN — A was deleted from legacy prod months ago.
  (1, 1, 'LW-BL-L', 62, 60, 2, 1, 0),
  -- A SKU that exists in no product_variant: reported, decided by a human.
  (2, 1, 'GONE-SKU', 11, 11, 0, 0, 0);

-- ── Receipts: both legacy trios ─────────────────────────────────────────────
CREATE TABLE "MaterialStockReceipts" (
  id int PRIMARY KEY, receipt_code text, warehouse_id int, status text, provider text,
  note text, reject_reason text, created_by int, approved_by int, approved_at timestamp,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "MaterialStockReceipts" (id, receipt_code, warehouse_id, status, provider, created_by) VALUES
  (1, 'MSR-0001', 1, 'complete', 'Acme',   2),
  (2, 'MSR-0002', 1, 'partial',  NULL,     2),
  -- Unknown status → PENDING + report.
  (3, 'MSR-0003', 1, 'mystery',  NULL,     NULL);

CREATE TABLE "MaterialStockReceiptShipments" (
  id int PRIMARY KEY, receipt_id int, vendor_id int, shipment_code text,
  tracking_number text, carrier text, tracking_url text, expected_arrival_at timestamp,
  shipped_at timestamp, received_at timestamp, status text, note text,
  metadata jsonb, evidence jsonb,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "MaterialStockReceiptShipments" (id, receipt_id, vendor_id, shipment_code, tracking_number, status, evidence) VALUES
  -- Evidence urls point at the LEGACY host: carried verbatim, files not copied.
  (1, 1, 1, 'S1', 'TRK-AAA', 'received', '[{"url":"https://legacy.example/e1.jpg","filename":"e1.jpg"}]'::jsonb),
  (2, 2, NULL, 'S1', 'TRK-BBB', 'partial_received', NULL);

CREATE TABLE "MaterialStockReceiptLines" (
  id int PRIMARY KEY, receipt_id int, shipment_id int, material_item_id int,
  requested_quantity int, received_quantity int, rejected_quantity int,
  unit_price numeric, note text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "MaterialStockReceiptLines" (id, receipt_id, shipment_id, material_item_id, requested_quantity, received_quantity, rejected_quantity, unit_price) VALUES
  (1, 1, 1, 1, 100, 100, 0, 4.50),
  (2, 2, 2, 2, 50,  20,  1, 0.80);

CREATE TABLE "PhysicalStockReceipt" (
  id int PRIMARY KEY, receipt_code text, warehouse_id int, status text, provider text,
  note text, reject_reason text, created_by int, approved_by int, approved_at timestamp,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
-- Legacy id 1 COLLIDES with MaterialStockReceipts id 1. Ids must be re-issued;
-- the CODES are what stay unique and findable.
INSERT INTO "PhysicalStockReceipt" (id, receipt_code, warehouse_id, status, created_by) VALUES
  (1, 'PSR-0001', 1, 'complete', 2);

CREATE TABLE "PhysicalStockReceiptShipment" (
  id int PRIMARY KEY, receipt_id int, shipment_code text, tracking_number text,
  carrier text, tracking_url text, expected_arrival_at timestamp, shipped_at timestamp,
  received_at timestamp, status text, note text, metadata jsonb, evidence jsonb,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "PhysicalStockReceiptShipment" (id, receipt_id, shipment_code, tracking_number, status) VALUES
  (1, 1, 'S1', 'TRK-CCC', 'received');

CREATE TABLE "PhysicalStockReceiptLine" (
  id int PRIMARY KEY, receipt_id int, shipment_id int, physical_variant_sku text,
  requested_quantity int, received_quantity int, note text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "PhysicalStockReceiptLine" (id, receipt_id, shipment_id, physical_variant_sku, requested_quantity, received_quantity) VALUES
  (1, 1, 1, 'LW-BL-L',  30, 30),
  -- SKU with no product_variant: line skipped + reported (the XOR CHECK means
  -- it cannot be inserted pointing at nothing).
  (2, 1, 1, 'GONE-SKU', 5,  5);

-- ── Ledgers ─────────────────────────────────────────────────────────────────
CREATE TABLE "MaterialInventoryMovements" (
  id int PRIMARY KEY, warehouse_id int, material_item_id int, reservation_id int,
  bom_id int, bom_line_id int, order_id int, type text, quantity int,
  reference_type text, reference_id text, created_by int, note text,
  created_at timestamp DEFAULT now()
);
INSERT INTO "MaterialInventoryMovements" (id, warehouse_id, material_item_id, reservation_id, bom_id, bom_line_id, order_id, type, quantity, created_by) VALUES
  (1, 1, 1, NULL, NULL, NULL, NULL, 'receipt',          100, 2),
  (2, 1, 1, 1,    1,    1,    900001, 'material_reserve',   5, 2),
  (3, 1, 1, 1,    1,    1,    900001, 'material_consume',  -5, 2),
  -- Unknown type: reported and SKIPPED, never coerced into a wrong bucket.
  (4, 1, 1, NULL, NULL, NULL, NULL, 'mystery_type',      99, NULL);

CREATE TABLE "InventoryMovement" (
  id int PRIMARY KEY, warehouse_id int, physical_variant_sku text, type text,
  quantity int, reference_type text, reference_id text, created_by int, note text,
  created_at timestamp DEFAULT now()
);
INSERT INTO "InventoryMovement" (id, warehouse_id, physical_variant_sku, type, quantity, created_by) VALUES
  (1, 1, 'LW-BL-L', 'receipt',  30, 2),
  -- legacy "assign" is our CONSUME.
  (2, 1, 'LW-BL-L', 'assign',   -2, 2),
  -- Orphan SKU and unknown type: two different reports, neither an abort.
  (3, 1, 'GONE-SKU','receipt',   5, NULL),
  (4, 1, 'LW-BL-L', 'nonsense', 11, NULL);

-- ── Reservations ────────────────────────────────────────────────────────────
CREATE TABLE "MaterialInventoryReservations" (
  id int PRIMARY KEY, warehouse_id int, material_item_id int, bom_id int,
  bom_line_id int, order_id int, quantity int, consumed_quantity int, status text,
  created_by int, note text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "MaterialInventoryReservations" (id, warehouse_id, material_item_id, bom_id, bom_line_id, order_id, quantity, consumed_quantity, status, created_by) VALUES
  -- consumed_quantity > 0 must survive the trip intact.
  (1, 1, 1, 1, 1, 900001, 5, 5, 'consumed', 2),
  (2, 1, 2, 1, 2, 900002, 3, 0, 'reserved', 2),
  -- Order 777777 does not exist: reservation is a LIVE CLAIM with a real FK,
  -- so this is reported and skipped rather than forced in.
  (3, 1, 1, NULL, NULL, 777777, 9, 0, 'reserved', NULL);

-- ── BOMs ────────────────────────────────────────────────────────────────────
CREATE TABLE "Boms" (
  id int PRIMARY KEY, product_variant_id int, name text, version int, status text,
  effective_from timestamp, effective_to timestamp, note text,
  created_by int, updated_by int,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), deleted_at timestamp
);
INSERT INTO "Boms" (id, product_variant_id, name, version, status, created_by) VALUES
  (1, 1000, 'Wallet BOM', 1, 'active', 2),
  -- TWO active versions for ONE variant. Our services assume exactly one, so
  -- the migration must retire the older and say so.
  (2, 1000, 'Wallet BOM', 2, 'active', 2),
  (3, 2000, 'Tote BOM',   1, 'draft',  2);

CREATE TABLE "BomLines" (
  id int PRIMARY KEY, bom_id int, component_product_variant_id int, material_item_id int,
  component_sku text, component_name text, quantity_per_unit numeric, unit text,
  wastage_rate numeric, stage text, required boolean, sort_order int, note text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
INSERT INTO "BomLines" (id, bom_id, component_product_variant_id, material_item_id, component_sku, component_name, quantity_per_unit, unit, wastage_rate, stage, required, sort_order) VALUES
  (1, 1, NULL, 1,    'MAT-LEATHER', 'Leather sheet', 0.1500, 'm',   0.0500, 'production', true,  0),
  (2, 1, NULL, 2,    'MAT-BOX',     'Shipping box',  1.0000, 'pcs', 0,      'packing',    true,  1),
  -- A component that is a PRODUCT VARIANT, not a material. Legacy prod
  -- auto-converted these on save; the migration does that conversion once, by
  -- SKU, creating the material if it is missing.
  (3, 2, 2000, NULL, 'CT-BR-S',     'Canvas tote',   2.0000, 'pcs', 0,      'production', true,  0),
  -- Neither a material nor a resolvable variant: lands UNMAPPED on purpose.
  (4, 2, NULL, NULL, 'MYSTERY-SKU', 'Unknown part',  1.0000, 'pcs', 0,      'other',      true,  1),
  -- Unknown stage string must fall back, not abort.
  (5, 3, NULL, 4,    'MAT-GLUE',    'Glue',          5.0000, 'ml',  0,      'weird',      false, 0);
