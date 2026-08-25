-- ─────────────────────────────────────────────────────────────────────────────
-- test-pricing-engine-097.sql
--
-- Post-097 test harness using REAL current metal prices from pricing_metal_rates.
-- Run after 097 migration completes.
--
-- Uses real Class A data:
--   18ct Yellow Gold: $207.00/g  (from pricing_metal_rates)
--   9ct Yellow Gold:  $104.83/g
--   multipliers from pricing_component_rules (metal 1.40, labour 1.80, lab_stone 11.0)
--
-- Everything runs in a transaction that rolls back — no permanent changes.
-- Check the Messages tab in Supabase SQL Editor for PASS/FAIL output.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
  v_tenant_id   uuid := '00000000-0000-0000-0000-000000000001';

  -- We'll insert a minimal design + band recipe + piece for testing
  v_design_id   uuid;
  v_piece_id    uuid;

  -- Known real values from pricing_metal_rates after 097
  v_gold_18y    numeric;
  v_gold_9y     numeric;

  -- Test results
  v_result      jsonb;
  v_total       numeric;
  v_expected    numeric;

  -- Counters
  v_pass        int := 0;
  v_fail        int := 0;

  -- Fixed recipe/piece inputs
  v_gram_weight_18  numeric := 4.200;   -- 18ct ring, 4.2g
  v_gram_weight_9   numeric := 5.100;   -- 9ct ring, 5.1g
  v_labour_cost     numeric := 280.00;
  v_setting_cost    numeric := 60.00;

BEGIN

  -- ── Read real metal prices ──────────────────────────────────────────────────
  SELECT price_per_gram INTO v_gold_18y
  FROM pricing_metal_rates
  WHERE tenant_id = v_tenant_id AND metal_type = '18ct Yellow Gold';

  SELECT price_per_gram INTO v_gold_9y
  FROM pricing_metal_rates
  WHERE tenant_id = v_tenant_id AND metal_type = '9ct Yellow Gold';

  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════════';
  RAISE NOTICE '  calculate_price() post-097 test harness';
  RAISE NOTICE '  Real metal prices from pricing_metal_rates:';
  RAISE NOTICE '    18ct Yellow Gold: $%/g', v_gold_18y;
  RAISE NOTICE '    9ct Yellow Gold:  $%/g', v_gold_9y;
  RAISE NOTICE '══════════════════════════════════════════════════════════════';
  RAISE NOTICE '';

  IF v_gold_18y IS NULL OR v_gold_9y IS NULL THEN
    RAISE EXCEPTION 'pricing_metal_rates missing expected rows — check tenant_id backfill in 097';
  END IF;

  -- ── Insert test fixtures ────────────────────────────────────────────────────

  INSERT INTO inventory_products (
    tenant_id, name, product_type, metal_karat, metal_colour,
    labour_cost, setting_cost, melee_included
  ) VALUES (
    v_tenant_id, '__test_design_097__', 'ring', '18K', 'Yellow',
    v_labour_cost, v_setting_cost, false
  )
  RETURNING id INTO v_design_id;

  INSERT INTO design_band_recipes (
    tenant_id, design_id, band_width_mm, metal_karat, gram_weight
  ) VALUES (
    v_tenant_id, v_design_id, 2.50, '18K', v_gram_weight_18
  );

  INSERT INTO inventory_pieces (
    tenant_id, product_id, sku, metal_karat, metal_colour,
    metal_weight_grams, status
  ) VALUES (
    v_tenant_id, v_design_id, '__test_piece_097__', '18K', 'Yellow',
    v_gram_weight_18, 'in_stock'
  )
  RETURNING id INTO v_piece_id;

  -- ── TEST 1: Made-to-order, 18ct Yellow, no stone ───────────────────────────
  --
  -- Expected:
  --   metal_cost    = 4.200 × $207.00          = $869.40
  --   metal_retail  = $869.40 × 1.40           = $1,217.16
  --   labour_retail = ($280 + $60) × 1.80      = $612.00
  --   total         = $1,217.16 + $612.00      = $1,829.16
  --
  v_expected := ROUND((v_gram_weight_18 * v_gold_18y * 1.40) + ((v_labour_cost + v_setting_cost) * 1.80), 2);

  v_result := calculate_price(
    p_tenant_id     := v_tenant_id,
    p_design_id     := v_design_id,
    p_band_width_mm := 2.50,
    p_metal_karat   := '18K',
    p_metal_colour  := 'Yellow'
  );

  IF v_result->>'error' IS NOT NULL THEN
    RAISE NOTICE '[FAIL] TEST 1 — MTO 18ct Yellow no stone: error = %', v_result->>'error';
    v_fail := v_fail + 1;
  ELSIF ABS((v_result->>'total_retail')::numeric - v_expected) > 0.01 THEN
    RAISE NOTICE '[FAIL] TEST 1 — MTO 18ct Yellow no stone: got $% expected $%',
      v_result->>'total_retail', v_expected;
    v_fail := v_fail + 1;
  ELSE
    RAISE NOTICE '[PASS] TEST 1 — MTO 18ct Yellow, no stone: $%', v_result->>'total_retail';
    RAISE NOTICE '         metal $% + labour $% = total $%',
      v_result->>'metal_retail', v_result->>'labour_retail', v_result->>'total_retail';
    v_pass := v_pass + 1;
  END IF;

  -- ── TEST 2: Ready-to-wear, same ring ───────────────────────────────────────
  --
  -- Same gram weight and labour/setting — should produce identical total.
  --
  v_result := calculate_price(
    p_tenant_id := v_tenant_id,
    p_piece_id  := v_piece_id
  );

  IF v_result->>'error' IS NOT NULL THEN
    RAISE NOTICE '[FAIL] TEST 2 — RTW mode: error = %', v_result->>'error';
    v_fail := v_fail + 1;
  ELSIF ABS((v_result->>'total_retail')::numeric - v_expected) > 0.01 THEN
    RAISE NOTICE '[FAIL] TEST 2 — RTW mode: got $% expected $%',
      v_result->>'total_retail', v_expected;
    v_fail := v_fail + 1;
  ELSE
    RAISE NOTICE '[PASS] TEST 2 — RTW mode produces same total: $%', v_result->>'total_retail';
    v_pass := v_pass + 1;
  END IF;

  -- ── TEST 3: MTO with lab stone, 0.80ct, wholesale $900 ────────────────────
  --
  -- stone_retail = $900 × 11.0 = $9,900
  -- total = $1,829.16 + $9,900 = $11,729.16
  --
  v_expected := ROUND(
    (v_gram_weight_18 * v_gold_18y * 1.40)
    + ((v_labour_cost + v_setting_cost) * 1.80)
    + (900.00 * 11.0),
    2
  );

  v_result := calculate_price(
    p_tenant_id      := v_tenant_id,
    p_design_id      := v_design_id,
    p_band_width_mm  := 2.50,
    p_metal_karat    := '18K',
    p_metal_colour   := 'Yellow',
    p_stone_wholesale := 900.00,
    p_stone_carat    := 0.80,
    p_stone_origin   := 'lab'
  );

  IF v_result->>'error' IS NOT NULL THEN
    RAISE NOTICE '[FAIL] TEST 3 — lab stone 0.80ct: error = %', v_result->>'error';
    v_fail := v_fail + 1;
  ELSIF ABS((v_result->>'total_retail')::numeric - v_expected) > 0.01 THEN
    RAISE NOTICE '[FAIL] TEST 3 — lab stone 0.80ct: got $% expected $%',
      v_result->>'total_retail', v_expected;
    v_fail := v_fail + 1;
  ELSE
    RAISE NOTICE '[PASS] TEST 3 — lab stone 0.80ct @ $900 wholesale: total $%', v_result->>'total_retail';
    RAISE NOTICE '         metal $% + labour $% + stone $% (11× multiplier)',
      v_result->>'metal_retail', v_result->>'labour_retail', v_result->>'stone_retail';
    v_pass := v_pass + 1;
  END IF;

  -- ── TEST 4: MTO with natural stone, 1.20ct (hits 1–2ct tier, 2.0×) ────────
  --
  -- stone_retail = $1,500 × 2.0 = $3,000
  --
  v_expected := ROUND(
    (v_gram_weight_18 * v_gold_18y * 1.40)
    + ((v_labour_cost + v_setting_cost) * 1.80)
    + (1500.00 * 2.0),
    2
  );

  v_result := calculate_price(
    p_tenant_id       := v_tenant_id,
    p_design_id       := v_design_id,
    p_band_width_mm   := 2.50,
    p_metal_karat     := '18K',
    p_metal_colour    := 'Yellow',
    p_stone_wholesale := 1500.00,
    p_stone_carat     := 1.20,
    p_stone_origin    := 'natural'
  );

  IF v_result->>'error' IS NOT NULL THEN
    RAISE NOTICE '[FAIL] TEST 4 — natural stone 1.20ct: error = %', v_result->>'error';
    v_fail := v_fail + 1;
  ELSIF ABS((v_result->>'total_retail')::numeric - v_expected) > 0.01 THEN
    RAISE NOTICE '[FAIL] TEST 4 — natural stone 1.20ct: got $% expected $%',
      v_result->>'total_retail', v_expected;
    v_fail := v_fail + 1;
  ELSE
    RAISE NOTICE '[PASS] TEST 4 — natural 1.20ct @ $1,500 wholesale: total $%', v_result->>'total_retail';
    RAISE NOTICE '         stone $% (2.0× tier)', v_result->>'stone_retail';
    v_pass := v_pass + 1;
  END IF;

  -- ── TEST 5: 9ct Yellow Gold — confirm key format resolves ─────────────────
  --
  -- labour_cost and setting_cost come from the same design (18K fields),
  -- but we override metal to 9ct. The gram weight for 9ct is different in reality
  -- but here we reuse the recipe gram weight to confirm the metal lookup works.
  -- Expected: metal_retail = v_gram_weight_18 × v_gold_9y × 1.40
  --
  -- We need a 9ct recipe row for the same design to test this properly
  INSERT INTO design_band_recipes (
    tenant_id, design_id, band_width_mm, metal_karat, gram_weight
  ) VALUES (
    v_tenant_id, v_design_id, 2.50, '9K', v_gram_weight_9
  );

  v_expected := ROUND(
    (v_gram_weight_9 * v_gold_9y * 1.40)
    + ((v_labour_cost + v_setting_cost) * 1.80),
    2
  );

  v_result := calculate_price(
    p_tenant_id     := v_tenant_id,
    p_design_id     := v_design_id,
    p_band_width_mm := 2.50,
    p_metal_karat   := '9K',
    p_metal_colour  := 'Yellow'
  );

  IF v_result->>'error' IS NOT NULL THEN
    RAISE NOTICE '[FAIL] TEST 5 — 9ct Yellow key format: error = %', v_result->>'error';
    v_fail := v_fail + 1;
  ELSIF ABS((v_result->>'total_retail')::numeric - v_expected) > 0.01 THEN
    RAISE NOTICE '[FAIL] TEST 5 — 9ct Yellow: got $% expected $%',
      v_result->>'total_retail', v_expected;
    v_fail := v_fail + 1;
  ELSE
    RAISE NOTICE '[PASS] TEST 5 — 9ct Yellow Gold (key format resolves): total $%', v_result->>'total_retail';
    RAISE NOTICE '         metal $%/g × %g × 1.40 = $%',
      v_gold_9y, v_gram_weight_9, v_result->>'metal_retail';
    v_pass := v_pass + 1;
  END IF;

  -- ── TEST 6: Missing metal type returns clear error (not crash) ─────────────
  INSERT INTO design_band_recipes (
    tenant_id, design_id, band_width_mm, metal_karat, gram_weight
  ) VALUES (
    v_tenant_id, v_design_id, 2.50, 'Titanium', 3.00
  );

  v_result := calculate_price(
    p_tenant_id     := v_tenant_id,
    p_design_id     := v_design_id,
    p_band_width_mm := 2.50,
    p_metal_karat   := 'Titanium',
    p_metal_colour  := 'Silver'
  );

  IF v_result->>'error' = 'no_metal_rate' THEN
    RAISE NOTICE '[PASS] TEST 6 — unknown metal returns no_metal_rate: %', v_result->>'metal_type';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE '[FAIL] TEST 6 — expected no_metal_rate, got: %', v_result;
    v_fail := v_fail + 1;
  END IF;

  -- ── Summary ─────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════════';
  IF v_fail = 0 THEN
    RAISE NOTICE '  ALL % TESTS PASSED', v_pass;
    RAISE NOTICE '';
    RAISE NOTICE '  Sanity check — eyeball these numbers:';
    RAISE NOTICE '  18ct Yellow, 4.2g, no stone:    $%',
      ROUND((4.200 * v_gold_18y * 1.40) + (340.00 * 1.80), 2);
    RAISE NOTICE '  18ct Yellow, 4.2g, 0.80ct lab @ $900:  $%',
      ROUND((4.200 * v_gold_18y * 1.40) + (340.00 * 1.80) + (900.00 * 11.0), 2);
    RAISE NOTICE '  18ct Yellow, 4.2g, 1.20ct nat @ $1500: $%',
      ROUND((4.200 * v_gold_18y * 1.40) + (340.00 * 1.80) + (1500.00 * 2.0), 2);
  ELSE
    RAISE NOTICE '  % PASSED, % FAILED — do not use calculate_price() until fixed', v_pass, v_fail;
  END IF;
  RAISE NOTICE '══════════════════════════════════════════════════════════════';

END;
$$;

ROLLBACK;
