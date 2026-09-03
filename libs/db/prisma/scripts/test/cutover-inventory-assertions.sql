-- ============================================================================
-- Inventory cutover assertions (doc 06 phase E) — run after
-- migrate-legacy-inventory.sql against the fixture.
-- ============================================================================
-- Every check RAISEs on failure, so psql -v ON_ERROR_STOP=1 exits non-zero and
-- run-cutover-test.sh reports a failure.
--
-- The point of this file is NOT that the counts add up. It is that each
-- awkward row in the fixture is handled the way the migration promises: an
-- orphan is REPORTED (never silently dropped), an unknown enum FALLS BACK
-- (never aborts), an unknown movement type is SKIPPED (never coerced into the
-- wrong bucket), and a duplicate ACTIVE BOM is RESOLVED.
--
-- Delete any one of those behaviours from the migration and exactly one
-- assertion here should fail. That was checked by hand once — see doc 06 §E2.
-- ============================================================================

DO $$
DECLARE
  n int; t text; d numeric; b int;
BEGIN
  -- ── 1. Vendors ───────────────────────────────────────────────────────────
  SELECT count(*) INTO n FROM vendors;
  IF n <> 2 THEN RAISE EXCEPTION 'vendors: expected 2, got %', n; END IF;

  SELECT status::text INTO t FROM vendors WHERE id = 2;
  IF t <> 'ACTIVE' THEN RAISE EXCEPTION 'unknown vendor status should fall back to ACTIVE, got %', t; END IF;

  SELECT count(*) INTO n FROM migration_report WHERE step = 'vendors';
  IF n <> 1 THEN RAISE EXCEPTION 'the unknown vendor status should be reported once, got %', n; END IF;

  -- ── 2. Materials — and the NAME COLLISION ────────────────────────────────
  -- Legacy "Materials" is an attribute catalog (leather/canvas/wood). If any of
  -- it leaked into `materials`, the count is wrong and the floor gets three
  -- phantom items it can never stock.
  SELECT count(*) INTO n FROM materials WHERE name IN ('Leather', 'Canvas', 'Wood');
  IF n <> 0 THEN RAISE EXCEPTION 'legacy attribute catalog leaked into materials: % rows', n; END IF;

  SELECT type::text INTO t FROM materials WHERE sku = 'MAT-WEIRD';
  IF t <> 'OTHER' THEN RAISE EXCEPTION 'unknown material type should become OTHER, got %', t; END IF;

  SELECT count(*) INTO n FROM migration_report
   WHERE step = 'materials' AND issue LIKE '%unknown material type%';
  IF n <> 1 THEN RAISE EXCEPTION 'unknown material type should be reported once, got %', n; END IF;

  -- Untracked materials still migrate; they simply hold no stock.
  SELECT count(*) INTO n FROM materials WHERE sku = 'MAT-GLUE' AND track_inventory = false;
  IF n <> 1 THEN RAISE EXCEPTION 'track_inventory=false did not survive'; END IF;

  -- ── 3. Material stock ────────────────────────────────────────────────────
  SELECT count(*) INTO n FROM material_stock;
  IF n <> 2 THEN RAISE EXCEPTION 'material_stock: expected 2 (third has no warehouse), got %', n; END IF;

  SELECT count(*) INTO n FROM migration_report
   WHERE step = 'material_stock' AND legacy_id = '3';
  IF n <> 1 THEN RAISE EXCEPTION 'the orphaned material stock row must be reported, not dropped'; END IF;

  -- Counters carried across; legacy `stock` deliberately did NOT.
  SELECT reserved INTO n FROM material_stock WHERE material_id = 1 AND warehouse_id = 1;
  IF n <> 5 THEN RAISE EXCEPTION 'material_stock reserved: expected 5, got %', n; END IF;

  -- ── 4. Finished-goods stock: system B WINS over the dead system A ────────
  -- The main cutover migrated WarehouseInventory (system A, deleted from
  -- legacy prod 2026-06-18) for this same shelf. PhysicalInventories is the
  -- live data, so its numbers must be the ones standing.
  SELECT quantity INTO n FROM warehouse_inventory wi
    JOIN product_variants pv ON pv.id = wi.product_variant_id
   WHERE pv.sku = 'LW-BL-L' AND wi.warehouse_id = 1;
  IF n <> 62 THEN RAISE EXCEPTION 'physical stock should overwrite system A: expected 62, got %', n; END IF;

  SELECT reserved INTO n FROM warehouse_inventory wi
    JOIN product_variants pv ON pv.id = wi.product_variant_id
   WHERE pv.sku = 'LW-BL-L' AND wi.warehouse_id = 1;
  IF n <> 2 THEN RAISE EXCEPTION 'physical reserved should be carried: expected 2, got %', n; END IF;

  SELECT count(*) INTO n FROM migration_report
   WHERE step = 'warehouse_inventory' AND detail LIKE '%GONE-SKU%';
  IF n <> 1 THEN RAISE EXCEPTION 'the unmatched physical SKU must be reported for a human to decide'; END IF;

  -- ── 5. Receipts: two legacy series, one table, ids re-issued ─────────────
  SELECT count(*) INTO n FROM stock_receipts;
  IF n <> 4 THEN RAISE EXCEPTION 'stock_receipts: expected 4 (3 material + 1 physical), got %', n; END IF;

  -- Both legacy series start at id 1. If ids were reused, one would be lost.
  SELECT count(DISTINCT code) INTO n FROM stock_receipts;
  IF n <> 4 THEN RAISE EXCEPTION 'receipt codes collided: % distinct of 4', n; END IF;

  SELECT item_type::text INTO t FROM stock_receipts WHERE code = 'PSR-0001';
  IF t <> 'PRODUCT' THEN RAISE EXCEPTION 'PSR receipt should be PRODUCT, got %', t; END IF;

  SELECT item_type::text INTO t FROM stock_receipts WHERE code = 'MSR-0001';
  IF t <> 'MATERIAL' THEN RAISE EXCEPTION 'MSR receipt should be MATERIAL, got %', t; END IF;

  SELECT status::text INTO t FROM stock_receipts WHERE code = 'MSR-0003';
  IF t <> 'PENDING' THEN RAISE EXCEPTION 'unknown receipt status should fall back to PENDING, got %', t; END IF;

  -- Shipments land under the RIGHT receipt — the id re-issue is where a
  -- cutover most easily attaches a parcel to somebody else's paperwork.
  SELECT count(*) INTO n FROM stock_receipt_shipments s
    JOIN stock_receipts r ON r.id = s.receipt_id
   WHERE r.code = 'MSR-0001' AND s.tracking_number = 'TRK-AAA';
  IF n <> 1 THEN RAISE EXCEPTION 'material shipment did not land under MSR-0001'; END IF;

  SELECT count(*) INTO n FROM stock_receipt_shipments s
    JOIN stock_receipts r ON r.id = s.receipt_id
   WHERE r.code = 'PSR-0001' AND s.tracking_number = 'TRK-CCC';
  IF n <> 1 THEN RAISE EXCEPTION 'physical shipment did not land under PSR-0001'; END IF;

  -- Evidence carried VERBATIM, still pointing at the legacy host.
  SELECT (evidence -> 0 ->> 'url') INTO t FROM stock_receipt_shipments
   WHERE tracking_number = 'TRK-AAA';
  IF t <> 'https://legacy.example/e1.jpg' THEN
    RAISE EXCEPTION 'evidence json was not carried verbatim, got %', t; END IF;

  -- Lines: the physical line whose SKU is gone cannot be inserted (XOR CHECK),
  -- so it is reported instead.
  SELECT count(*) INTO n FROM stock_receipt_lines;
  IF n <> 3 THEN RAISE EXCEPTION 'receipt lines: expected 3 (2 material + 1 physical), got %', n; END IF;

  SELECT count(*) INTO n FROM migration_report
   WHERE step = 'stock_receipt_lines' AND detail LIKE '%GONE-SKU%';
  IF n <> 1 THEN RAISE EXCEPTION 'the orphaned physical receipt line must be reported'; END IF;

  -- Physical lines have no rejected_quantity in legacy — it defaults to 0.
  SELECT rejected_quantity INTO n FROM stock_receipt_lines l
    JOIN product_variants pv ON pv.id = l.product_variant_id
   WHERE pv.sku = 'LW-BL-L';
  IF n <> 0 THEN RAISE EXCEPTION 'physical line rejected_quantity should default to 0, got %', n; END IF;

  -- Every line points at exactly one item (the CHECK would have refused
  -- otherwise, but assert it so a dropped constraint shows up here too).
  SELECT count(*) INTO n FROM stock_receipt_lines
   WHERE (material_id IS NULL) = (product_variant_id IS NULL);
  IF n <> 0 THEN RAISE EXCEPTION '% receipt lines violate the XOR rule', n; END IF;

  -- ── 6. BOMs ──────────────────────────────────────────────────────────────
  SELECT count(*) INTO n FROM boms;
  IF n <> 3 THEN RAISE EXCEPTION 'boms: expected 3, got %', n; END IF;

  -- THE ONE-ACTIVE RULE. Legacy had two active versions for variant 1000; our
  -- services assume exactly one, so the newest wins and the other is retired.
  SELECT count(*) INTO n FROM boms WHERE product_variant_id = 1000 AND status = 'ACTIVE';
  IF n <> 1 THEN RAISE EXCEPTION 'exactly one ACTIVE BOM per variant expected, got %', n; END IF;

  SELECT version INTO n FROM boms WHERE product_variant_id = 1000 AND status = 'ACTIVE';
  IF n <> 2 THEN RAISE EXCEPTION 'the NEWEST version should stay active, got v%', n; END IF;

  SELECT count(*) INTO n FROM migration_report
   WHERE step = 'boms' AND issue LIKE '%more than one ACTIVE%';
  IF n <> 1 THEN RAISE EXCEPTION 'the duplicate-active BOM must be reported'; END IF;

  -- ── 7. BOM lines, including the auto-conversion ──────────────────────────
  SELECT count(*) INTO n FROM bom_lines;
  IF n <> 5 THEN RAISE EXCEPTION 'bom_lines: expected 5, got %', n; END IF;

  -- Decimal precision survives: 0.1500/unit at 5% wastage is what production
  -- actually consumes, and rounding it here would quietly change the recipe.
  SELECT quantity_per_unit INTO d FROM bom_lines WHERE id = 1;
  IF d <> 0.1500 THEN RAISE EXCEPTION 'quantity_per_unit lost precision: %', d; END IF;
  SELECT wastage_rate INTO d FROM bom_lines WHERE id = 1;
  IF d <> 0.0500 THEN RAISE EXCEPTION 'wastage_rate lost precision: %', d; END IF;

  -- THE AUTO-CONVERSION: a line that named a PRODUCT VARIANT resolves to a
  -- material created here, by SKU, exactly as legacy prod did on save.
  SELECT count(*) INTO n FROM materials WHERE sku = 'CT-BR-S';
  IF n <> 1 THEN RAISE EXCEPTION 'the component product-variant was not converted into a material'; END IF;

  SELECT m.sku INTO t FROM bom_lines bl JOIN materials m ON m.id = bl.material_id WHERE bl.id = 3;
  IF t <> 'CT-BR-S' THEN RAISE EXCEPTION 'converted BOM line did not link to its new material, got %', t; END IF;

  -- THE UNMAPPED LINE: a first-class state, not a failure. It keeps its sku so
  -- the Configs page can show what it wanted, and the floor fixes it in the UI.
  SELECT material_id INTO n FROM bom_lines WHERE id = 4;
  IF n IS NOT NULL THEN RAISE EXCEPTION 'line 4 should be UNMAPPED, got material %', n; END IF;

  SELECT component_sku INTO t FROM bom_lines WHERE id = 4;
  IF t <> 'MYSTERY-SKU' THEN RAISE EXCEPTION 'unmapped line lost its component_sku, got %', t; END IF;

  SELECT count(*) INTO n FROM migration_report
   WHERE step = 'bom_lines' AND legacy_id = '4';
  IF n <> 1 THEN RAISE EXCEPTION 'the unmapped BOM line must be reported'; END IF;

  SELECT stage::text INTO t FROM bom_lines WHERE id = 5;
  IF t <> 'OTHER' THEN RAISE EXCEPTION 'unknown stage should fall back to OTHER, got %', t; END IF;

  -- ── 8. Reservations ──────────────────────────────────────────────────────
  SELECT count(*) INTO n FROM inventory_reservations;
  IF n <> 2 THEN RAISE EXCEPTION 'reservations: expected 2 (third has no order), got %', n; END IF;

  -- consumed_quantity > 0 survives: it is the difference between "held" and
  -- "already taken", and losing it would double-count on a later release.
  SELECT consumed_quantity INTO n FROM inventory_reservations WHERE id = 1;
  IF n <> 5 THEN RAISE EXCEPTION 'consumed_quantity did not survive: expected 5, got %', n; END IF;

  SELECT status::text INTO t FROM inventory_reservations WHERE id = 1;
  IF t <> 'CONSUMED' THEN RAISE EXCEPTION 'reservation status: expected CONSUMED, got %', t; END IF;

  SELECT count(*) INTO n FROM migration_report
   WHERE step = 'inventory_reservations' AND legacy_id = '3';
  IF n <> 1 THEN RAISE EXCEPTION 'the reservation with no order must be reported, not forced in'; END IF;

  -- ── 9. Movements: both ledgers, one table ────────────────────────────────
  -- 3 material (of 4 — one has an unknown type) + 2 physical (of 4 — one
  -- unknown type, one orphan SKU).
  SELECT count(*) INTO n FROM inventory_movements;
  IF n <> 5 THEN RAISE EXCEPTION 'movements: expected 5, got %', n; END IF;

  -- legacy "assign" is our CONSUME, and it keeps its negative sign.
  SELECT quantity INTO n FROM inventory_movements
   WHERE item_type = 'PRODUCT' AND type = 'CONSUME';
  IF n <> -2 THEN RAISE EXCEPTION 'assign→CONSUME should keep quantity -2, got %', n; END IF;

  SELECT count(*) INTO n FROM inventory_movements
   WHERE item_type = 'MATERIAL' AND type = 'RESERVE';
  IF n <> 1 THEN RAISE EXCEPTION 'material_reserve→RESERVE missing'; END IF;

  -- Unknown types are SKIPPED and reported, never coerced into a wrong bucket.
  SELECT count(*) INTO n FROM migration_report
   WHERE step = 'inventory_movements' AND issue LIKE '%unknown movement type%';
  IF n <> 2 THEN RAISE EXCEPTION 'both unknown movement types must be reported, got %', n; END IF;

  SELECT count(*) INTO n FROM migration_report
   WHERE step = 'inventory_movements' AND issue LIKE '%no product_variant%';
  IF n <> 1 THEN RAISE EXCEPTION 'the orphan-SKU movement must be reported'; END IF;

  -- Same XOR rule as the lines.
  SELECT count(*) INTO n FROM inventory_movements
   WHERE (material_id IS NULL) = (product_variant_id IS NULL);
  IF n <> 0 THEN RAISE EXCEPTION '% movements violate the XOR rule', n; END IF;

  -- ── 10. Sequences advanced past the explicit ids ─────────────────────────
  IF (SELECT last_value FROM pg_sequences
      WHERE schemaname = 'public' AND sequencename = 'materials_id_seq') <= 4
    THEN RAISE EXCEPTION 'materials sequence not advanced past migrated ids'; END IF;

  IF (SELECT last_value FROM pg_sequences
      WHERE schemaname = 'public' AND sequencename = 'boms_id_seq') <= 3
    THEN RAISE EXCEPTION 'boms sequence not advanced past migrated ids'; END IF;

  -- ── 11. NOTHING WAS DROPPED IN SILENCE ───────────────────────────────────
  -- The whole contract of this migration. Every fixture row that did not
  -- arrive must have a line in the report explaining itself.
  SELECT count(*) INTO n FROM migration_report;
  IF n < 9 THEN
    RAISE EXCEPTION 'expected at least 9 reported orphans/fallbacks, got % — something was dropped quietly', n;
  END IF;

  RAISE NOTICE 'All inventory cutover assertions passed (% report rows).', n;
END $$;
