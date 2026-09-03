-- ============================================================================
-- Cutover assertions — run after migrate-legacy.sql against the fixture.
-- ============================================================================
-- Every check RAISEs on failure, so psql -v ON_ERROR_STOP=1 exits non-zero and
-- run-cutover-test.sh reports a failure. Add a check here whenever the cutover
-- grows a new mapping.
-- ============================================================================

DO $$
DECLARE
  n int; t text; arr text[];
BEGIN
  -- ── Row counts: nothing silently dropped ─────────────────────────────────
  SELECT count(*) INTO n FROM users;
  IF n <> 9 THEN RAISE EXCEPTION 'users: expected 9, got %', n; END IF;

  SELECT count(*) INTO n FROM warehouses;
  IF n <> 3 THEN RAISE EXCEPTION 'warehouses: expected 3, got %', n; END IF;

  SELECT count(*) INTO n FROM orders;
  IF n <> 2 THEN RAISE EXCEPTION 'orders: expected 2, got %', n; END IF;

  SELECT count(*) INTO n FROM transactions;
  IF n <> 3 THEN RAISE EXCEPTION 'transactions: expected 3, got %', n; END IF;

  -- ── Warehouse codes: unique, collision-safe, sane fallback ───────────────
  SELECT count(DISTINCT code) INTO n FROM warehouses;
  IF n <> 3 THEN RAISE EXCEPTION 'warehouse codes not unique: % distinct of 3', n; END IF;

  SELECT code INTO t FROM warehouses WHERE id = 1;
  IF t <> 'HOCHIMIN-1' THEN RAISE EXCEPTION 'warehouse 1 code: expected HOCHIMIN-1, got %', t; END IF;

  -- Same display name as #1 — the id suffix must keep it distinct.
  SELECT code INTO t FROM warehouses WHERE id = 2;
  IF t <> 'HOCHIMIN-2' THEN RAISE EXCEPTION 'warehouse 2 code: expected HOCHIMIN-2, got %', t; END IF;

  -- No alphanumerics in the name at all.
  SELECT code INTO t FROM warehouses WHERE id = 3;
  IF t <> 'WH-3' THEN RAISE EXCEPTION 'warehouse 3 code: expected WH-3, got %', t; END IF;

  -- Unknown legacy status falls back to INACTIVE, never errors.
  SELECT status::text INTO t FROM warehouses WHERE id = 3;
  IF t <> 'INACTIVE' THEN RAISE EXCEPTION 'warehouse 3 status: expected INACTIVE, got %', t; END IF;

  -- ── Roles: the bug that would have silently demoted staff ────────────────
  SELECT roles::text[] INTO arr FROM users WHERE id = '3';
  IF NOT (arr @> '{SUPPORT}') THEN RAISE EXCEPTION 'supporter -> SUPPORT failed, got %', arr; END IF;

  SELECT roles::text[] INTO arr FROM users WHERE id = '4';
  IF NOT (arr @> '{WAREHOUSE_ADMIN}') THEN RAISE EXCEPTION 'warehouse_admin -> WAREHOUSE_ADMIN failed, got %', arr; END IF;

  SELECT roles::text[] INTO arr FROM users WHERE id = '5';
  IF NOT (arr @> '{DESIGNER}') THEN RAISE EXCEPTION 'designer -> DESIGNER failed, got %', arr; END IF;

  SELECT roles::text[] INTO arr FROM users WHERE id = '6';
  IF NOT (arr @> '{WAREHOUSE}') THEN RAISE EXCEPTION 'warehouse_external -> WAREHOUSE failed, got %', arr; END IF;

  SELECT roles::text[] INTO arr FROM users WHERE id = '2';
  IF NOT (arr @> '{SELLER}') THEN RAISE EXCEPTION 'customer -> SELLER failed, got %', arr; END IF;

  -- Genuinely unknown role strings still fall back to SELLER.
  SELECT roles::text[] INTO arr FROM users WHERE id = '8';
  IF NOT (arr @> '{SELLER}') THEN RAISE EXCEPTION 'unknown role fallback failed, got %', arr; END IF;

  -- Multi-role users keep every mapped role.
  SELECT roles::text[] INTO arr FROM users WHERE id = '9';
  IF NOT (arr @> '{ADMIN,SUPPORT}') THEN RAISE EXCEPTION 'multi-role failed, got %', arr; END IF;

  -- ── Warehouse membership backfill ────────────────────────────────────────
  SELECT count(*) INTO n FROM warehouse_members;
  IF n <> 3 THEN RAISE EXCEPTION 'warehouse_members: expected 3 (users 4,6,7), got %', n; END IF;

  SELECT count(*) INTO n FROM warehouse_members WHERE user_id = '7' AND warehouse_id = 1 AND is_primary;
  IF n <> 1 THEN RAISE EXCEPTION 'user 7 primary membership in warehouse 1 missing'; END IF;

  -- ── Product allow-list: valid ids kept, missing ones dropped ─────────────
  SELECT count(*) INTO n FROM user_allowed_products WHERE user_id = '6';
  IF n <> 2 THEN RAISE EXCEPTION 'user 6 allow-list: expected 2 (10,20 kept; 999 dropped), got %', n; END IF;

  SELECT count(*) INTO n FROM user_allowed_products WHERE product_id = 999;
  IF n <> 0 THEN RAISE EXCEPTION 'product 999 does not exist and must not be linked'; END IF;

  -- Non-array and empty configs.products must produce nothing, not an error.
  SELECT count(*) INTO n FROM user_allowed_products WHERE user_id IN ('8', '9');
  IF n <> 0 THEN RAISE EXCEPTION 'users 8/9 should have no allow-list rows, got %', n; END IF;

  -- Unrestricted users get no rows at all (absence = permissive).
  SELECT count(*) INTO n FROM user_allowed_products WHERE user_id = '2';
  IF n <> 0 THEN RAISE EXCEPTION 'unrestricted user 2 must have no allow-list rows'; END IF;

  -- ── Orders: warehouse-user dereference (the legacy design quirk) ─────────
  -- Legacy Orders.warehouse_id pointed at a USER; that user becomes
  -- assigned_to_id and their site becomes warehouse_id.
  SELECT assigned_to_id INTO t FROM orders WHERE id = 900001;
  IF t <> '7' THEN RAISE EXCEPTION 'order assigned_to_id: expected user 7, got %', t; END IF;

  SELECT warehouse_id::text INTO t FROM orders WHERE id = 900001;
  IF t <> '1' THEN RAISE EXCEPTION 'order warehouse_id: expected site 1, got %', t; END IF;

  SELECT status::text INTO t FROM orders WHERE id = 900001;
  IF t <> 'IN_PRODUCTION' THEN RAISE EXCEPTION 'order 1 status: expected IN_PRODUCTION, got %', t; END IF;

  -- Unknown legacy status falls back to PENDING.
  SELECT status::text INTO t FROM orders WHERE id = 900002;
  IF t <> 'PENDING' THEN RAISE EXCEPTION 'order 2 status: expected PENDING, got %', t; END IF;

  -- Legacy-only fields are preserved under configs.legacy rather than lost.
  SELECT configs -> 'legacy' ->> 'basketPosition' INTO t FROM orders WHERE id = 900001;
  IF t <> 'A-01-01' THEN RAISE EXCEPTION 'legacy basketPosition not preserved, got %', t; END IF;

  SELECT basket_position_id::text INTO t FROM orders WHERE id = 900001;
  IF t <> '7000' THEN RAISE EXCEPTION 'basket position not linked by name, got %', t; END IF;

  -- ── Addresses and shipments only for orders that have them ───────────────
  SELECT count(*) INTO n FROM addresses;
  IF n <> 1 THEN RAISE EXCEPTION 'addresses: expected 1 (only order 900001), got %', n; END IF;

  SELECT shipping_address_id::text INTO t FROM orders WHERE id = 900001;
  IF t IS NULL THEN RAISE EXCEPTION 'order 900001 not linked to its address'; END IF;

  SELECT count(*) INTO n FROM shipments;
  IF n <> 1 THEN RAISE EXCEPTION 'shipments: expected 1, got %', n; END IF;

  -- ── Money: amounts and fallbacks ─────────────────────────────────────────
  SELECT balance::text INTO t FROM users WHERE id = '2';
  IF t::numeric <> 150.75 THEN RAISE EXCEPTION 'seller balance: expected 150.75, got %', t; END IF;

  SELECT debt::text INTO t FROM users WHERE id = '8';
  IF t::numeric <> 12.50 THEN RAISE EXCEPTION 'debt not carried over, got %', t; END IF;

  SELECT type::text INTO t FROM transactions WHERE id = 8001;
  IF t <> 'ORDER_PAYMENT' THEN RAISE EXCEPTION 'payment -> ORDER_PAYMENT failed, got %', t; END IF;

  SELECT status::text INTO t FROM transactions WHERE id = 8000;
  IF t <> 'COMPLETED' THEN RAISE EXCEPTION 'success -> COMPLETED failed, got %', t; END IF;

  -- Unknown type/status fall back rather than aborting the cutover.
  SELECT type::text INTO t FROM transactions WHERE id = 8002;
  IF t <> 'TOPUP' THEN RAISE EXCEPTION 'unknown txn type fallback failed, got %', t; END IF;

  -- A null legacy transaction_id must still yield a public id.
  SELECT public_id INTO t FROM transactions WHERE id = 8002;
  IF t IS NULL OR length(t) = 0 THEN RAISE EXCEPTION 'null transaction_id not backfilled'; END IF;

  -- ── API keys: hashed, never plaintext ────────────────────────────────────
  SELECT count(*) INTO n FROM api_keys;
  IF n <> 2 THEN RAISE EXCEPTION 'api_keys: expected 2, got %', n; END IF;

  SELECT count(*) INTO n FROM api_keys WHERE key_hash = 'legacy-key-admin';
  IF n <> 0 THEN RAISE EXCEPTION 'api key stored in plaintext'; END IF;

  SELECT key_hash INTO t FROM api_keys WHERE user_id = '1';
  IF t <> encode(digest('legacy-key-admin', 'sha256'), 'hex')
    THEN RAISE EXCEPTION 'api key hash mismatch, got %', t; END IF;

  -- ── Tier prices: base always, tiers only when set ────────────────────────
  SELECT count(*) INTO n FROM variant_prices WHERE product_variant_id = 1000;
  IF n <> 5 THEN RAISE EXCEPTION 'pv 1000: expected 5 tier rows, got %', n; END IF;

  SELECT count(*) INTO n FROM variant_prices WHERE product_variant_id = 2000;
  IF n <> 1 THEN RAISE EXCEPTION 'pv 2000: expected 1 (base only) tier row, got %', n; END IF;

  -- ── Enum fallbacks elsewhere ─────────────────────────────────────────────
  SELECT status::text INTO t FROM products WHERE id = 30;
  IF t <> 'INACTIVE' THEN RAISE EXCEPTION 'unknown product status fallback failed, got %', t; END IF;

  SELECT status::text INTO t FROM basket_positions WHERE id = 7001;
  IF t <> 'BROKEN' THEN RAISE EXCEPTION 'break -> BROKEN failed, got %', t; END IF;

  SELECT priority::text INTO t FROM tickets WHERE id = 6001;
  IF t <> 'LOW' THEN RAISE EXCEPTION 'unknown ticket priority fallback failed, got %', t; END IF;

  SELECT status::text INTO t FROM tickets WHERE id = 6000;
  IF t <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'processing -> IN_PROGRESS failed, got %', t; END IF;

  -- ── Soft delete preserved ────────────────────────────────────────────────
  SELECT count(*) INTO n FROM users WHERE id = '8' AND deleted_at IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'soft-deleted user lost its deleted_at'; END IF;

  -- ── Sequences advanced past the explicit ids we inserted ─────────────────
  IF (SELECT last_value FROM pg_sequences
      WHERE schemaname = 'public' AND sequencename = 'warehouses_id_seq') <= 3
    THEN RAISE EXCEPTION 'warehouses sequence not advanced past migrated ids'; END IF;

  RAISE NOTICE 'All cutover assertions passed.';
END $$;
