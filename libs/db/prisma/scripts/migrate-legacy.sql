-- ============================================================================
-- opcreative — legacy → new schema data migration
-- Maps the old backend's tables (.archive/oldproject/fulfillment-system-be,
-- PascalCase names) into the new Prisma schema (snake_case names).
-- ============================================================================
--
-- ⚠ PROD ONLY — the legacy data lives in the old production database. Local
-- dev starts fresh from prisma/migrations and never runs this script.
-- (Tested end-to-end 2026-07-20 against a scratch Postgres 17 with seeded
-- legacy data: all row counts matched, enum fallbacks and links verified.)
--
-- HOW TO RUN (prod cutover)
--   1. Create the schema on the new prod DB (Neon URL in .env.prod):
--        cd libs/db && npm run db:migrate:prod
--   2. Copy the LEGACY tables into the same database (they're PascalCase,
--      the new ones are snake_case, so nothing collides):
--        pg_dump --no-owner --no-privileges "$OLD_DATABASE_URL" | psql "$PROD_DATABASE_URL"
--   3. Run this script — it's one transaction, all-or-nothing:
--        psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/scripts/migrate-legacy.sql
--   4. Check the count report it prints, spot-check data in the app, then run
--      the commented DROP block at the bottom to remove the legacy tables.
--
-- NOTES
--   • User ids: legacy Int ids become text ("42"); new users get cuids from
--     the app. All user foreign keys are migrated the same way.
--   • API keys: only SHA-256 hashes are stored now. Legacy plaintext keys are
--     hashed below, so existing integrations keep working — the API must hash
--     the presented key (sha256 hex) and look it up by key_hash.
--   • PRICE UNIT: legacy variant prices were integers. If they were CENTS,
--     replace "/ 1.0" with "/ 100.0" in the two places marked PRICE_DIVISOR.
--   • Unknown status strings fall back to a safe default in each CASE. Run the
--     pre-flight audit below FIRST and extend the CASEs if it shows values
--     these mappings don't cover.
--
-- ============================================================================
-- PRE-FLIGHT AUDIT (run these by hand, read-only — they don't change anything)
-- ============================================================================
-- SELECT DISTINCT status            FROM "Users";
-- SELECT DISTINCT unnest(roles)     FROM "Users";
-- SELECT DISTINCT status            FROM "Products";
-- SELECT DISTINCT status            FROM "Variants";
-- SELECT DISTINCT warehouse_status  FROM "Orders";
-- SELECT DISTINCT status            FROM "Ticket";
-- SELECT DISTINCT priority          FROM "Ticket";
-- SELECT DISTINCT status, type      FROM "TopupTransaction";
-- SELECT DISTINCT status            FROM "BasketPosition";
-- SELECT DISTINCT movement_type     FROM "ImportMovement";
-- SELECT DISTINCT basket_position   FROM "Orders" WHERE basket_position IS NOT NULL;
--
-- DUPLICATE SKUs — settles whether ProductVariant can take a unique constraint.
-- The new schema deliberately ships WITHOUT @@unique([productId, variantId])
-- because nobody could check this. Run it the moment you have legacy access:
--
--   SELECT product_id, variant_id, count(*), array_agg(id) AS ids
--   FROM "ProductVariants" WHERE deleted_at IS NULL
--   GROUP BY product_id, variant_id HAVING count(*) > 1;
--
--   NO ROWS  → add @@unique([productId, variantId]) to the Prisma model and
--              switch attachVariants to createMany({ skipDuplicates: true }).
--              That closes the attach race at the database, where it belongs.
--   ROWS     → decide per pair which id the orders point at, dedupe HERE
--              before the product_variants INSERT below, then add the
--              constraint. Do not add it first; the cutover will abort.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- digest() for api-key hashing

-- ── 1. Warehouses (no dependencies) ─────────────────────────────────────────
-- `code` is UNIQUE NOT NULL and legacy has no equivalent column, so it is
-- generated here with the same rule as the schema migration: first 8
-- alphanumerics of the name, uppercased, suffixed with the id for uniqueness.
INSERT INTO warehouses (id, code, name, line1, city, state, zip, country, status, created_at, updated_at)
SELECT
  w.id,
  COALESCE(
    NULLIF(UPPER(LEFT(REGEXP_REPLACE(w.display_name, '[^a-zA-Z0-9]+', '', 'g'), 8)), ''),
    'WH'
  ) || '-' || w.id::text,
  w.display_name, w.address, w.city, w.state, w.zipcode, w.country,
  (CASE lower(coalesce(w.status, 'active'))
     WHEN 'active' THEN 'ACTIVE' ELSE 'INACTIVE' END)::"WarehouseStatus",
  w.created_at, w.updated_at
FROM "Warehouse" w;

-- ── 2. Users (legacy Int id → text) ─────────────────────────────────────────
-- Email is lowercased on the way in: our login lowercases before lookup, and
-- 120 legacy emails carried capitals — migrated verbatim they could never sign
-- in. Lowercasing then makes case-variant twins (Merchfox… vs merchfox…) collide
-- on our UNIQUE(email), so within each lowercased-email group only the PRIMARY
-- (most orders, then most recent) keeps the clean address; the rest get a
-- `+legacy<id>` tag — still their real inbox, and greppable as merge candidates.
WITH email_rank AS (
  SELECT u2.id,
         ROW_NUMBER() OVER (
           PARTITION BY lower(u2.email)
           ORDER BY (SELECT count(*) FROM "Orders" o WHERE o.customer_id = u2.id) DESC,
                    u2.id DESC
         ) AS rn
  FROM "Users" u2
)
INSERT INTO users (id, name, username, email, password_hash, phone, status, roles,
                   tier, balance, debt, webhook_url, webhook_secret, configs,
                   last_login_at, warehouse_id, created_at, updated_at, deleted_at)
SELECT
  u.id::text, u.display_name, u.username,
  CASE
    WHEN er.rn = 1 OR position('@' in u.email) = 0 THEN lower(u.email)
    ELSE split_part(lower(u.email), '@', 1) || '+legacy' || u.id
         || '@' || split_part(lower(u.email), '@', 2)
  END,
  u.password, u.phone,
  (CASE lower(coalesce(u.status, 'active'))
     WHEN 'active' THEN 'ACTIVE'
     WHEN 'banned' THEN 'BANNED'
     ELSE 'INACTIVE' END)::"UserStatus",
  -- Legacy carried 7 role strings. Mapping every unknown one to SELLER (the
  -- old ELSE branch) would have handed supporters and warehouse managers a
  -- seller's access while stripping their own, so each is mapped explicitly.
  -- `warehouse_external` is a WAREHOUSE whose product access is expressed as
  -- user_allowed_products rows (see section 4b), not as a role of its own.
  coalesce(
    (SELECT array_agg(DISTINCT (CASE lower(trim(r))
        WHEN 'admin'              THEN 'ADMIN'
        WHEN 'seller'             THEN 'SELLER'
        WHEN 'customer'           THEN 'SELLER'
        WHEN 'warehouse'          THEN 'WAREHOUSE'
        WHEN 'warehouse_external' THEN 'WAREHOUSE'
        WHEN 'warehouse_admin'    THEN 'WAREHOUSE_ADMIN'
        WHEN 'support'            THEN 'SUPPORT'
        WHEN 'supporter'          THEN 'SUPPORT'
        WHEN 'designer'           THEN 'DESIGNER'
        ELSE 'SELLER' END)::"UserRole")
     FROM unnest(u.roles) AS r),
    '{SELLER}'::"UserRole"[]),
  u.tier, coalesce(u.balance, 0), coalesce(u.debt, 0),
  u.webhook_url, u.webhook_key, u.configs,
  u.last_login, u.warehouse_id, u.created_at, u.updated_at, u.deleted_at
FROM "Users" u
JOIN email_rank er ON er.id = u.id;

-- ── 2b. Warehouse membership ────────────────────────────────────────────────
-- The schema migration backfills this from users.warehouse_id, but those rows
-- did not exist yet when it ran, so the same backfill repeats here.
INSERT INTO warehouse_members (user_id, warehouse_id, is_primary, created_at)
SELECT u.id::text, u.warehouse_id, true, now()
FROM "Users" u
WHERE u.warehouse_id IS NOT NULL
ON CONFLICT (user_id, warehouse_id) DO NOTHING;

-- ── 3. API keys (hash legacy plaintext keys) ────────────────────────────────
INSERT INTO api_keys (user_id, key_hash, name, last_used_at, created_at)
SELECT
  u.id::text, encode(digest(u.api_key, 'sha256'), 'hex'), 'legacy key',
  u.api_key_last_used_at, coalesce(u.api_key_created_at, now())
FROM "Users" u
WHERE u.api_key IS NOT NULL;

-- ── 4. Catalog ──────────────────────────────────────────────────────────────
INSERT INTO products (id, name, key, thumbnail, status, configs, created_at, updated_at, deleted_at)
SELECT
  p.id, p.display_name, p.key, p.thumbnails,
  (CASE lower(coalesce(p.status, 'inactive'))
     WHEN 'active' THEN 'ACTIVE' WHEN 'draft' THEN 'DRAFT'
     WHEN 'archived' THEN 'ARCHIVED' ELSE 'INACTIVE' END)::"ProductStatus",
  p.configs, p.created_at, p.updated_at, p.deleted_at
FROM "Products" p;

INSERT INTO variants (id, name, key, status, data, configs, created_at, updated_at, deleted_at)
SELECT
  v.id, v.display_name, v.key,
  (CASE lower(coalesce(v.status, 'active'))
     WHEN 'active' THEN 'ACTIVE' WHEN 'draft' THEN 'DRAFT'
     WHEN 'archived' THEN 'ARCHIVED' ELSE 'INACTIVE' END)::"ProductStatus",
  v.data, v.configs, v.created_at, v.updated_at, v.deleted_at
FROM "Variants" v;

INSERT INTO product_variants (id, product_id, variant_id, sku, stock, needed,
                              sale_price, position, configs, data,
                              created_at, updated_at, deleted_at)
SELECT
  pv.id, pv.product_id, pv.variant_id, pv.sku, pv.stock, pv.needed,
  pv.sale_price / 1.0,  -- PRICE_DIVISOR: use / 100.0 if legacy prices were cents
  pv.position, pv.configs, pv.data, now(), now(), pv.deleted_at
FROM "ProductVariants" pv;

-- Tier columns → variant_prices rows (tier 0 = base; tiers 1-4 only if set)
INSERT INTO variant_prices (product_variant_id, tier, price, created_at, updated_at)
SELECT
  pv.id, t.tier,
  t.price / 1.0,  -- PRICE_DIVISOR: use / 100.0 if legacy prices were cents
  now(), now()
FROM "ProductVariants" pv
CROSS JOIN LATERAL (VALUES
  (0, pv.price), (1, pv.price_tier_1), (2, pv.price_tier_2),
  (3, pv.price_tier_3), (4, pv.price_tier_4)) AS t(tier, price)
WHERE t.tier = 0 OR t.price > 0;

INSERT INTO mockups (id, name, thumbnail, url, folder_id, status, created_at, updated_at)
SELECT m.id, m.display_name, m.thumbnails, m.url, m.folder_id,
       coalesce(m.status, 'active'), m.created_at, m.updated_at
FROM "Mockups" m;

-- ── 4b. Per-user product allow-list ─────────────────────────────────────────
-- Legacy stored this as an untyped `configs.products` array of product ids on
-- restricted ("warehouse_external") partners. Runs after products so the FK
-- resolves; ids no longer in the catalog are dropped rather than failing the
-- cutover.
INSERT INTO user_allowed_products (user_id, product_id, created_at)
SELECT DISTINCT u.id::text, p.value::int, now()
FROM "Users" u
CROSS JOIN LATERAL jsonb_array_elements_text(u.configs::jsonb -> 'products') AS p(value)
WHERE jsonb_typeof(u.configs::jsonb -> 'products') = 'array'
  AND p.value ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM products pr WHERE pr.id = p.value::int)
ON CONFLICT (user_id, product_id) DO NOTHING;

-- ── 5. Basket positions ─────────────────────────────────────────────────────
INSERT INTO basket_positions (id, name, shelf_name, tracking_number, "row", "column",
                              level, status, note, created_at, updated_at)
SELECT
  b.id, b.display_name, b.shelf_name, b.tracking_number, b.row, b."column", b.level,
  (CASE lower(coalesce(b.status, 'available'))
     WHEN 'available' THEN 'AVAILABLE'
     WHEN 'reserved'  THEN 'RESERVED'
     WHEN 'occupied'  THEN 'OCCUPIED'
     WHEN 'break'     THEN 'BROKEN'
     ELSE 'AVAILABLE' END)::"BasketPositionStatus",
  b.note, b.created_at, b.updated_at
FROM "BasketPosition" b;

-- ── 6. Orders ───────────────────────────────────────────────────────────────
-- Legacy Orders.warehouse_id pointed at a warehouse-role USER; that becomes
-- assigned_to_id, and the real warehouse comes from that user's warehouse_id.
-- Dropped-but-preserved legacy fields land in configs.legacy.
INSERT INTO orders (id, external_id, marketplace, source, seller,
                    customer_id, assigned_to_id, warehouse_id,
                    product_id, variant_id, product_variant_id, mockup_id,
                    basket_position_id, quantity, filled, status,
                    placed_at, assigned_at, fulfilled_at, deadline, paid,
                    base_cost, fee, revenue, profit,
                    note, internal_note, image_url, configs,
                    created_at, updated_at, deleted_at)
SELECT
  o.id, o.order_id, o.marketplace, o.source, o.seller,
  o.customer_id::text, o.warehouse_id::text, wu.warehouse_id,
  o.product_id, o.variant_id, o.product_variant_id, o.mockup_id,
  bp.id, o.quantity, o.filled,
  -- Real legacy prod uses Title-Case-with-spaces labels (audited 2026-07-23),
  -- not the snake_case this once assumed. lower() normalises case; the space
  -- variants ('in production', 'production ready', …) are the actual values.
  -- Unmapped labels no longer silently become PENDING — the raw string is kept
  -- in configs.legacy.warehouseStatus below so nothing is lost.
  (CASE lower(coalesce(o.warehouse_status, 'pending'))
     WHEN 'pending'          THEN 'PENDING'
     WHEN 'assigned'         THEN 'ASSIGNED'
     WHEN 'design sorted'    THEN 'ASSIGNED'
     WHEN 'processing'       THEN 'IN_PRODUCTION'
     WHEN 'in_production'    THEN 'IN_PRODUCTION'
     WHEN 'in production'    THEN 'IN_PRODUCTION'
     WHEN 'production ready' THEN 'IN_PRODUCTION'
     WHEN 'produced'         THEN 'IN_PRODUCTION'
     WHEN 'fulfilled'        THEN 'FULFILLED'
     WHEN 'filled'           THEN 'FULFILLED'
     WHEN 'completed'        THEN 'FULFILLED'
     WHEN 'shipped'          THEN 'SHIPPED'
     WHEN 'delivered'        THEN 'DELIVERED'
     WHEN 'cancelled'        THEN 'CANCELLED'
     WHEN 'canceled'         THEN 'CANCELLED'
     WHEN 'cancel'           THEN 'CANCELLED'
     WHEN 'refund'           THEN 'REFUNDED'
     WHEN 'refunded'         THEN 'REFUNDED'
     WHEN 'hold'             THEN 'ON_HOLD'
     WHEN 'on_hold'          THEN 'ON_HOLD'
     WHEN 'design problems'  THEN 'ON_HOLD'
     WHEN 'out of stock'     THEN 'ON_HOLD'
     WHEN 'wrong label'      THEN 'ON_HOLD'
     ELSE 'PENDING' END)::"FulfillmentStatus",
  o.order_date, o.assigned_at, o.fulfilled_at, o.deadline,
  coalesce(o.paid, 0) <> 0,
  o.base_cost, o.fee, o.revenue, o.profit,
  o.note, o.warehouse_note, o.order_image,
  coalesce(o.configs, '{}'::jsonb) || jsonb_build_object('legacy',
    jsonb_strip_nulls(jsonb_build_object(
      'leatherShape',    o.leather_shape,
      'productType',     o.product_type,
      'month',           o.month,
      'basketPosition',  o.basket_position,
      -- raw legacy status label, so the coarser FulfillmentStatus mapping above
      -- (e.g. Design problems / Out Of Stock / Wrong Label all → ON_HOLD) can be
      -- reconstructed if the business ever wants the finer distinction back.
      'warehouseStatus', o.warehouse_status,
      'variants',        to_jsonb(nullif(o.variants, '{}'::text[]))))),
  o.created_at, o.updated_at, o.deleted_at
FROM "Orders" o
LEFT JOIN "Users" wu ON wu.id = o.warehouse_id
LEFT JOIN LATERAL (
  SELECT b.id FROM "BasketPosition" b
  WHERE b.display_name = o.basket_position LIMIT 1
) bp ON true;

-- ── 7. Shipping addresses (snapshot per order) ──────────────────────────────
ALTER TABLE addresses ADD COLUMN _legacy_order_id int;

INSERT INTO addresses (name, company, email, line1, line2, city, state, zip,
                       country, created_at, updated_at, _legacy_order_id)
SELECT
  o.shipping_name, o.shipping_company, o.shipping_email,
  o.shipping_address, o.shipping_address_line_2, o.shipping_city,
  o.shipping_state, o.shipping_zipcode, o.shipping_country,
  o.created_at, now(), o.id
FROM "Orders" o
WHERE coalesce(o.shipping_name, o.shipping_email, o.shipping_address,
               o.shipping_city, o.shipping_zipcode, o.shipping_country) IS NOT NULL;

UPDATE orders o
SET shipping_address_id = a.id
FROM addresses a
WHERE a._legacy_order_id = o.id;

ALTER TABLE addresses DROP COLUMN _legacy_order_id;

-- ── 8. Shipments (order-level shipping/tracking columns → one shipment row) ─
INSERT INTO shipments (order_id, provider, method, cost, tracking_number,
                       tracking_status, label_url, label_path, shipped_at,
                       created_at, updated_at)
SELECT
  o.id, o.shipping_provider, o.shipping_method, o.shipping_cost,
  o.tracking_number, o.tracking_status, o.label_url, o.label_downloaded_path,
  o.fulfilled_at, o.created_at, now()
FROM "Orders" o
WHERE coalesce(o.tracking_number, o.tracking_status, o.label_url,
               o.shipping_provider) IS NOT NULL;

-- ── 9. Inventory ────────────────────────────────────────────────────────────
INSERT INTO warehouse_inventory (id, warehouse_id, product_variant_id, quantity,
                                 stock, bad_quantity, needed, created_at, updated_at)
SELECT wi.id, wi.warehouse_id, wi.product_variant_id, wi.quantity,
       wi.stock, wi.bad_quantity, wi.needed, now(), now()
FROM "WarehouseInventory" wi;

INSERT INTO stock_imports (id, product_variant_id, warehouse_id, quantity,
                           imported_at, note, provider, created_at, updated_at)
SELECT si.id, si.product_variant_id, si.warehouse_id, si.quantity,
       si.import_date, si.note, si.provider, si.created_at, si.updated_at
FROM "StockImport" si;

INSERT INTO import_movements (id, stock_import_id, order_ref, quantity,
                              movement_type, note, created_at, updated_at)
SELECT im.id, im.stock_import_id, im.order_id, im.quantity,
       im.movement_type, im.note, im.created_at, im.updated_at
FROM "ImportMovement" im;

-- ── 10. Tickets ─────────────────────────────────────────────────────────────
INSERT INTO tickets (id, title, description, reason, status, priority,
                     author_id, order_id, created_at, updated_at)
SELECT
  t.id, t.display_name, t.description, t.reason,
  (CASE lower(coalesce(t.status, 'open'))
     WHEN 'open'        THEN 'OPEN'
     WHEN 'in_progress' THEN 'IN_PROGRESS'
     WHEN 'processing'  THEN 'IN_PROGRESS'
     WHEN 'resolved'    THEN 'RESOLVED'
     WHEN 'done'        THEN 'RESOLVED'
     WHEN 'closed'      THEN 'CLOSED'
     ELSE 'OPEN' END)::"TicketStatus",
  (CASE lower(coalesce(t.priority, 'low'))
     WHEN 'low'    THEN 'LOW'
     WHEN 'medium' THEN 'MEDIUM'
     WHEN 'high'   THEN 'HIGH'
     WHEN 'urgent' THEN 'URGENT'
     ELSE 'LOW' END)::"TicketPriority",
  t.author_id::text, t.order_id, t.created_at, t.updated_at
FROM "Ticket" t;

-- ── 11. Transactions ────────────────────────────────────────────────────────
INSERT INTO transactions (id, public_id, user_id, amount, type, status,
                          payment_method, description, note,
                          balance_before, balance_after, created_at, updated_at)
SELECT
  tx.id, coalesce(tx.transaction_id, gen_random_uuid()::text), tx.user_id::text,
  tx.amount,
  -- 'deduction' is the bulk of legacy rows (order charges, ~2,971) and MUST map
  -- to ORDER_PAYMENT — leaving it in the ELSE branch turned every charge into a
  -- TOPUP and inverted balance reporting. Audited against prod 2026-07-23.
  (CASE lower(coalesce(tx.type, 'topup'))
     WHEN 'topup'         THEN 'TOPUP'
     WHEN 'deposit'       THEN 'TOPUP'
     WHEN 'deduction'     THEN 'ORDER_PAYMENT'
     WHEN 'payment'       THEN 'ORDER_PAYMENT'
     WHEN 'order'         THEN 'ORDER_PAYMENT'
     WHEN 'order_payment' THEN 'ORDER_PAYMENT'
     WHEN 'refund'        THEN 'REFUND'
     WHEN 'adjustment'    THEN 'ADJUSTMENT'
     ELSE 'TOPUP' END)::"TransactionType",
  (CASE lower(coalesce(tx.status, 'pending'))
     WHEN 'pending'   THEN 'PENDING'
     WHEN 'completed' THEN 'COMPLETED'
     WHEN 'success'   THEN 'COMPLETED'
     WHEN 'succeeded' THEN 'COMPLETED'
     WHEN 'failed'    THEN 'FAILED'
     WHEN 'rejected'  THEN 'FAILED'
     WHEN 'cancelled' THEN 'CANCELLED'
     WHEN 'canceled'  THEN 'CANCELLED'
     ELSE 'PENDING' END)::"TransactionStatus",
  tx.payment_method, tx.description, tx.note,
  tx.balance_before, tx.balance_after, tx.created_at, tx.updated_at
FROM "TopupTransaction" tx;

-- ── 12. App config ──────────────────────────────────────────────────────────
INSERT INTO app_configs (id, key, value, description, created_at, updated_at)
SELECT c.id, c.key, c.value, c.description,
       coalesce(c.created_at, now()), coalesce(c.updated_at, now())
FROM "AppConfig" c;

-- ── 13. Reset sequences (we inserted explicit ids above) ────────────────────
SELECT setval(pg_get_serial_sequence('warehouses', 'id'),          coalesce(max(id), 0) + 1, false) FROM warehouses;
SELECT setval(pg_get_serial_sequence('products', 'id'),            coalesce(max(id), 0) + 1, false) FROM products;
SELECT setval(pg_get_serial_sequence('variants', 'id'),            coalesce(max(id), 0) + 1, false) FROM variants;
SELECT setval(pg_get_serial_sequence('product_variants', 'id'),    coalesce(max(id), 0) + 1, false) FROM product_variants;
SELECT setval(pg_get_serial_sequence('mockups', 'id'),             coalesce(max(id), 0) + 1, false) FROM mockups;
SELECT setval(pg_get_serial_sequence('basket_positions', 'id'),    coalesce(max(id), 0) + 1, false) FROM basket_positions;
SELECT setval(pg_get_serial_sequence('orders', 'id'),              coalesce(max(id), 0) + 1, false) FROM orders;
SELECT setval(pg_get_serial_sequence('warehouse_inventory', 'id'), coalesce(max(id), 0) + 1, false) FROM warehouse_inventory;
SELECT setval(pg_get_serial_sequence('stock_imports', 'id'),       coalesce(max(id), 0) + 1, false) FROM stock_imports;
SELECT setval(pg_get_serial_sequence('import_movements', 'id'),    coalesce(max(id), 0) + 1, false) FROM import_movements;
SELECT setval(pg_get_serial_sequence('tickets', 'id'),             coalesce(max(id), 0) + 1, false) FROM tickets;
SELECT setval(pg_get_serial_sequence('transactions', 'id'),        coalesce(max(id), 0) + 1, false) FROM transactions;
SELECT setval(pg_get_serial_sequence('app_configs', 'id'),         coalesce(max(id), 0) + 1, false) FROM app_configs;

COMMIT;

-- ── Count report (legacy vs migrated — every row should be accounted for) ───
SELECT 'users' AS entity,              (SELECT count(*) FROM "Users") AS legacy,              (SELECT count(*) FROM users) AS migrated
UNION ALL SELECT 'api_keys',           (SELECT count(*) FROM "Users" WHERE api_key IS NOT NULL), (SELECT count(*) FROM api_keys)
UNION ALL SELECT 'warehouses',         (SELECT count(*) FROM "Warehouse"),                    (SELECT count(*) FROM warehouses)
UNION ALL SELECT 'products',           (SELECT count(*) FROM "Products"),                     (SELECT count(*) FROM products)
UNION ALL SELECT 'variants',           (SELECT count(*) FROM "Variants"),                     (SELECT count(*) FROM variants)
UNION ALL SELECT 'product_variants',   (SELECT count(*) FROM "ProductVariants"),              (SELECT count(*) FROM product_variants)
UNION ALL SELECT 'mockups',            (SELECT count(*) FROM "Mockups"),                      (SELECT count(*) FROM mockups)
UNION ALL SELECT 'orders',             (SELECT count(*) FROM "Orders"),                       (SELECT count(*) FROM orders)
UNION ALL SELECT 'shipments',          (SELECT count(*) FROM "Orders" WHERE coalesce(tracking_number, tracking_status, label_url, shipping_provider) IS NOT NULL), (SELECT count(*) FROM shipments)
UNION ALL SELECT 'warehouse_inventory',(SELECT count(*) FROM "WarehouseInventory"),           (SELECT count(*) FROM warehouse_inventory)
UNION ALL SELECT 'stock_imports',      (SELECT count(*) FROM "StockImport"),                  (SELECT count(*) FROM stock_imports)
UNION ALL SELECT 'import_movements',   (SELECT count(*) FROM "ImportMovement"),               (SELECT count(*) FROM import_movements)
UNION ALL SELECT 'tickets',            (SELECT count(*) FROM "Ticket"),                       (SELECT count(*) FROM tickets)
UNION ALL SELECT 'transactions',       (SELECT count(*) FROM "TopupTransaction"),             (SELECT count(*) FROM transactions)
UNION ALL SELECT 'basket_positions',   (SELECT count(*) FROM "BasketPosition"),               (SELECT count(*) FROM basket_positions)
UNION ALL SELECT 'app_configs',        (SELECT count(*) FROM "AppConfig"),                    (SELECT count(*) FROM app_configs);

-- ── Cleanup — run ONLY after verifying the migration ────────────────────────
-- DROP TABLE "ImportMovement", "StockImport", "WarehouseInventory", "Ticket",
--            "TopupTransaction", "Orders", "BasketPosition", "ProductVariants",
--            "Mockups", "Variants", "Products", "AppConfig", "Users",
--            "Warehouse" CASCADE;
