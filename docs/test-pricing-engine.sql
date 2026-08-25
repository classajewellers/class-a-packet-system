-- test-pricing-engine.sql
--
-- Pricing engine test harness
-- Run BEFORE executing 095_pricing_engine.sql on production.
-- Everything is wrapped in a transaction that rolls back — zero permanent changes.
--
-- What this proves:
--   1. Made-to-order mode returns a non-null total for a known design + band
--   2. Ready-to-wear mode returns the same total for the same spec
--   3. The JSONB breakdown is complete (all expected keys present)
--   4. Specific component values are arithmetically correct given known inputs
--   5. Both modes agree on total_retail to within $0.01
--
-- How to run:
--   Copy-paste into Supabase SQL Editor (production project).
--   All RAISE NOTICE output shows in the "Messages" tab.
--   If you see "ALL TESTS PASSED", the engine is ready.
--   If you see a FAILED line, do NOT proceed with production use.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
  -- Test fixtures — we'll insert minimal rows and clean them up on rollback
  v_tenant_id       uuid := '00000000-0000-0000-0000-000000000001';

  -- Synthetic design (we insert then use its real id)
  v_design_id       uuid;
  v_piece_id        uuid;

  -- Results
  v_mto_result      jsonb;
  v_rtw_result      jsonb;

  -- Extracted values
  v_mto_total       numeric;
  v_rtw_total       numeric;
  v_metal_retail    numeric;
  v_stone_retail    numeric;
  v_labour_retail   numeric;

  -- Test counters
  v_pass_count      int := 0;
  v_fail_count      int := 0;

  -- Gold price we'll seed (known value so we can compute expected totals)
  v_gold_per_gram   numeric := 120.00;  -- $120/g is plausible for 18ct Yellow
  v_gram_weight     numeric := 4.200;   -- band recipe gram weight

  -- Stone wholesale (passed by app, not stored in DB)
  v_stone_wholesale numeric := 1500.00;
  v_stone_carat     numeric := 0.80;    -- sub-1ct natural → 2.5x multiplier

  -- Expected component values (computed from seeded multipliers)
  v_expected_metal  numeric;
  v_expected_labour numeric;
  v_expected_stone  numeric;
  v_expected_total  numeric;

  -- Labour/setting costs seeded onto the design
  v_labour_cost     numeric := 200.00;
  v_setting_cost    numeric := 80.00;

BEGIN
  RAISE NOTICE '=== Vault Pricing Engine — Test Harness ===';
  RAISE NOTICE 'Tenant: %', v_tenant_id;
  RAISE NOTICE '';

  -- ──────────────────────────────────────────────────────────────────────────
  -- FIXTURE SETUP
  -- Insert the minimum data required for both test modes.
  -- All inserts are inside this transaction — rolled back at the end.
  -- ──────────────────────────────────────────────────────────────────────────

  -- 1. Ensure a gold price row exists for 18ct Yellow
  INSERT INTO pricing_gold_prices (tenant_id, metal_type, price_per_gram, effective_date)
  VALUES (v_tenant_id, '18ct Yellow', v_gold_per_gram, CURRENT_DATE)
  ON CONFLICT (tenant_id, metal_type) DO UPDATE
    SET price_per_gram = EXCLUDED.price_per_gram,
        effective_date = EXCLUDED.effective_date;

  -- 2. Insert a synthetic design (Layer 1)
  INSERT INTO inventory_products (
    id, tenant_id, name, category, labour_cost, setting_cost, melee_included
  ) VALUES (
    gen_random_uuid(), v_tenant_id, '[TEST] Solitaire Round', 'Engagement',
    v_labour_cost, v_setting_cost, false
  )
  RETURNING id INTO v_design_id;
  RAISE NOTICE 'Inserted test design: %', v_design_id;

  -- 3. Insert a band recipe for this design (18K, 2.00mm)
  INSERT INTO design_band_recipes (tenant_id, design_id, band_width_mm, metal_karat, gram_weight)
  VALUES (v_tenant_id, v_design_id, 2.00, '18K', v_gram_weight);

  -- 4. Insert a synthetic physical piece (Layer 3)
  --    Must mirror same spec as the made-to-order test so totals can be compared.
  INSERT INTO inventory_pieces (
    tenant_id, product_id, sku, status,
    metal_karat, metal_colour, metal_weight_grams
  ) VALUES (
    v_tenant_id, v_design_id, 'TEST-RTW-001', 'in_stock',
    '18K', 'Yellow', v_gram_weight
  )
  RETURNING id INTO v_piece_id;
  RAISE NOTICE 'Inserted test piece: %', v_piece_id;

  -- ──────────────────────────────────────────────────────────────────────────
  -- COMPUTE EXPECTED VALUES
  -- These must match what calculate_price() returns, using the seeded multipliers.
  -- Multipliers: metal=1.40, labour=1.80, natural_stone(0.80ct)=2.50
  -- ──────────────────────────────────────────────────────────────────────────

  v_expected_metal  := ROUND(v_gram_weight * v_gold_per_gram * 1.40,   2);  -- 4.2 × 120 × 1.40
  v_expected_labour := ROUND((v_labour_cost + v_setting_cost) * 1.80,  2);  -- 280 × 1.80
  v_expected_stone  := ROUND(v_stone_wholesale * 2.50,                  2);  -- 1500 × 2.50
  v_expected_total  := v_expected_metal + v_expected_labour + v_expected_stone;

  RAISE NOTICE 'Expected metal_retail:  $%', v_expected_metal;
  RAISE NOTICE 'Expected labour_retail: $%', v_expected_labour;
  RAISE NOTICE 'Expected stone_retail:  $%', v_expected_stone;
  RAISE NOTICE 'Expected total_retail:  $%', v_expected_total;
  RAISE NOTICE '';

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 1: Made-to-order mode — function returns without error
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '--- Test 1: Made-to-order mode ---';

  v_mto_result := calculate_price(
    p_tenant_id      := v_tenant_id,
    p_design_id      := v_design_id,
    p_band_width_mm  := 2.00,
    p_metal_karat    := '18K',
    p_metal_colour   := 'Yellow',
    p_stone_wholesale := v_stone_wholesale,
    p_stone_carat    := v_stone_carat,
    p_stone_origin   := 'natural'
  );

  RAISE NOTICE 'MTO result: %', v_mto_result;

  IF v_mto_result ? 'error' THEN
    RAISE NOTICE '  FAILED: calculate_price returned error: %', v_mto_result->>'error';
    v_fail_count := v_fail_count + 1;
  ELSE
    RAISE NOTICE '  PASSED: no error returned';
    v_pass_count := v_pass_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 2: MTO — mode field is correct
  -- ──────────────────────────────────────────────────────────────────────────
  IF v_mto_result->>'mode' = 'made_to_order' THEN
    RAISE NOTICE '  PASSED: mode = made_to_order';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE '  FAILED: mode = % (expected made_to_order)', v_mto_result->>'mode';
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 3: MTO — metal_retail is arithmetically correct
  -- ──────────────────────────────────────────────────────────────────────────
  v_metal_retail := (v_mto_result->>'metal_retail')::numeric;
  IF ABS(v_metal_retail - v_expected_metal) < 0.01 THEN
    RAISE NOTICE '  PASSED: metal_retail = $ % (expected $%)', v_metal_retail, v_expected_metal;
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE '  FAILED: metal_retail = $ % (expected $%)', v_metal_retail, v_expected_metal;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 4: MTO — labour_retail is arithmetically correct
  -- ──────────────────────────────────────────────────────────────────────────
  v_labour_retail := (v_mto_result->>'labour_retail')::numeric;
  IF ABS(v_labour_retail - v_expected_labour) < 0.01 THEN
    RAISE NOTICE '  PASSED: labour_retail = $ % (expected $%)', v_labour_retail, v_expected_labour;
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE '  FAILED: labour_retail = $ % (expected $%)', v_labour_retail, v_expected_labour;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 5: MTO — stone_retail is arithmetically correct (0.80ct → 2.5×)
  -- ──────────────────────────────────────────────────────────────────────────
  v_stone_retail := (v_mto_result->>'stone_retail')::numeric;
  IF ABS(v_stone_retail - v_expected_stone) < 0.01 THEN
    RAISE NOTICE '  PASSED: stone_retail = $ % (expected $%)', v_stone_retail, v_expected_stone;
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE '  FAILED: stone_retail = $ % (expected $%)', v_stone_retail, v_expected_stone;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 6: MTO — total_retail sums correctly
  -- ──────────────────────────────────────────────────────────────────────────
  v_mto_total := (v_mto_result->>'total_retail')::numeric;
  IF ABS(v_mto_total - v_expected_total) < 0.01 THEN
    RAISE NOTICE '  PASSED: total_retail = $ % (expected $%)', v_mto_total, v_expected_total;
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE '  FAILED: total_retail = $ % (expected $%)', v_mto_total, v_expected_total;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 7: MTO — JSONB breakdown contains all expected keys
  -- ──────────────────────────────────────────────────────────────────────────
  IF v_mto_result ? 'metal_retail'
     AND v_mto_result ? 'labour_retail'
     AND v_mto_result ? 'stone_retail'
     AND v_mto_result ? 'melee_retail'
     AND v_mto_result ? 'total_retail'
     AND v_mto_result ? 'inputs' THEN
    RAISE NOTICE '  PASSED: all expected JSONB keys present';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE '  FAILED: missing JSONB keys in: %', jsonb_object_keys(v_mto_result);
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 8: Ready-to-wear mode — function returns without error
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '--- Test 8: Ready-to-wear mode ---';

  v_rtw_result := calculate_price(
    p_tenant_id      := v_tenant_id,
    p_piece_id       := v_piece_id,
    p_stone_wholesale := v_stone_wholesale,
    p_stone_carat    := v_stone_carat,
    p_stone_origin   := 'natural'
  );

  RAISE NOTICE 'RTW result: %', v_rtw_result;

  IF v_rtw_result ? 'error' THEN
    RAISE NOTICE '  FAILED: calculate_price returned error: %', v_rtw_result->>'error';
    v_fail_count := v_fail_count + 1;
  ELSE
    RAISE NOTICE '  PASSED: no error returned';
    v_pass_count := v_pass_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 9: RTW — mode field is correct
  -- ──────────────────────────────────────────────────────────────────────────
  IF v_rtw_result->>'mode' = 'ready_to_wear' THEN
    RAISE NOTICE '  PASSED: mode = ready_to_wear';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE '  FAILED: mode = % (expected ready_to_wear)', v_rtw_result->>'mode';
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 10: Both modes agree on total_retail for identical spec
  --
  -- This is the critical test. Made-to-order and ready-to-wear use the same
  -- gram weight (from band recipe vs from piece row), same multipliers,
  -- same stone input. They must agree to within $0.01.
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '--- Test 10: Mode parity ---';

  v_rtw_total := (v_rtw_result->>'total_retail')::numeric;

  RAISE NOTICE 'MTO total: $%', v_mto_total;
  RAISE NOTICE 'RTW total: $%', v_rtw_total;
  RAISE NOTICE 'Difference: $%', ABS(v_mto_total - v_rtw_total);

  IF ABS(v_mto_total - v_rtw_total) < 0.01 THEN
    RAISE NOTICE '  PASSED: MTO and RTW totals agree ($%)', v_mto_total;
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE '  FAILED: MTO ($%) != RTW ($%) — modes are inconsistent', v_mto_total, v_rtw_total;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 11: Lab stone — flat 11x multiplier (no tier lookup)
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '--- Test 11: Lab stone 11x ---';

  DECLARE
    v_lab_result  jsonb;
    v_lab_stone   numeric;
    v_lab_expected numeric;
  BEGIN
    v_lab_result := calculate_price(
      p_tenant_id      := v_tenant_id,
      p_design_id      := v_design_id,
      p_band_width_mm  := 2.00,
      p_metal_karat    := '18K',
      p_metal_colour   := 'Yellow',
      p_stone_wholesale := 200.00,
      p_stone_carat    := 2.10,    -- >2ct, but lab ignores tier
      p_stone_origin   := 'lab'
    );
    v_lab_stone    := (v_lab_result->>'stone_retail')::numeric;
    v_lab_expected := ROUND(200.00 * 11.0, 2);

    IF ABS(v_lab_stone - v_lab_expected) < 0.01 THEN
      RAISE NOTICE '  PASSED: lab stone_retail = $% (expected $%)', v_lab_stone, v_lab_expected;
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE '  FAILED: lab stone_retail = $% (expected $%)', v_lab_stone, v_lab_expected;
      v_fail_count := v_fail_count + 1;
    END IF;
  END;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 12: No stone — stone_retail is 0
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '--- Test 12: No stone ---';

  DECLARE
    v_ns_result jsonb;
  BEGIN
    v_ns_result := calculate_price(
      p_tenant_id     := v_tenant_id,
      p_design_id     := v_design_id,
      p_band_width_mm := 2.00,
      p_metal_karat   := '18K',
      p_metal_colour  := 'Yellow'
    );

    IF (v_ns_result->>'stone_retail')::numeric = 0 THEN
      RAISE NOTICE '  PASSED: stone_retail = 0 when no stone passed';
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE '  FAILED: stone_retail = % (expected 0)', v_ns_result->>'stone_retail';
      v_fail_count := v_fail_count + 1;
    END IF;
  END;

  -- ──────────────────────────────────────────────────────────────────────────
  -- TEST 13: Invalid mode — explicit error returned, not exception
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '--- Test 13: Invalid mode (no piece, no design) ---';

  DECLARE
    v_bad_result jsonb;
  BEGIN
    v_bad_result := calculate_price(p_tenant_id := v_tenant_id);

    IF v_bad_result ? 'error' AND v_bad_result->>'error' = 'invalid_mode' THEN
      RAISE NOTICE '  PASSED: returns {error: invalid_mode}';
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE '  FAILED: expected {error: invalid_mode}, got: %', v_bad_result;
      v_fail_count := v_fail_count + 1;
    END IF;
  END;

  -- ──────────────────────────────────────────────────────────────────────────
  -- SUMMARY
  -- ──────────────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '=== RESULTS: % passed, % failed ===', v_pass_count, v_fail_count;

  IF v_fail_count = 0 THEN
    RAISE NOTICE 'ALL TESTS PASSED — pricing engine is ready for production.';
  ELSE
    RAISE NOTICE 'TESTS FAILED — do NOT run 095_pricing_engine.sql on production until all pass.';
    RAISE EXCEPTION 'Test harness failed: % test(s) did not pass. See NOTICE output above for details.', v_fail_count;
  END IF;

END;
$$;

-- Roll back everything — the test harness makes no permanent changes.
ROLLBACK;
