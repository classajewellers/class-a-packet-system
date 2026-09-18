-- ─────────────────────────────────────────────────────────────────────────────
-- 098: Replace flat lab_stone multiplier with evidence-based carat tiers
--
-- Problem: a single 11× flat multiplier for all lab stones was only validated
-- against 1–3ct comparisons. Real-world market comparison data (Aug 2026) shows dramatic
-- compression at larger carats — 7.06ct D/VVS1 = 3.86×, not 11×.
--
-- Fix:
--   1. Delete the flat 11× lab_stone row.
--   2. Insert 6 carat-tiered rows derived from real D/VVS1 competitor retail
--      prices vs Nivoda wholesale costs (Aug 2026).
--   3. Replace calculate_price() so lab_stone uses the same carat-range lookup
--      that natural_stone already uses.
--
-- Evidence anchors (D/VVS1, external market comparison — retail ÷ Nivoda wholesale):
--   ≤2ct  10.50×   (D=10.50, E=10.53, F=10.55 — three grades agree, strong)
--   3ct    8.47×   (D/VVS1 only)
--   4ct    6.95×   (D/VVS1; E=9.92×, F=9.96× at 4ct — see NOTE A below)
--   5ct    5.46×   (D/VVS1 only)
--   6ct    4.91×   (D/VVS1; E=6.98×, F=8.48× at 6ct — see NOTE A)
--   7.06ct 3.86×   (D/VVS1)
--   8.61ct 3.85×   (D/VVS1 — confirmed plateau)
--
-- NOTE A — D-anchored conservative pricing:
--   At 4ct and 6ct, E/VVS1 and F/VS1 show significantly higher effective
--   multipliers than D/VVS1 (D 4ct=6.95× vs E=9.92×, F=9.96×). This is
--   structurally expected: D carries a higher wholesale premium but retail
--   doesn't scale proportionally in the lab market. These tiers are therefore
--   conservative for E/F stones — they will produce suggested retail prices
--   below market E/F pricing at 4ct+.
--   FOLLOW-UP REQUIRED: gather E/VVS1 market comparison data at 3ct, 5ct, 7ct
--   before building colour-specific tiers. Tracked in build brief: "EF Colour-Specific Lab Tiers".
--
-- NOTE B — IF clarity NOT handled above 3ct:
--   D/IF data: 3ct=6.97×, 5ct=1.94×, 7ct=1.28× (near-wholesale at large sizes).
--   The 3ct→5ct gap is too large to interpolate safely. No IF-specific tier is
--   shipped in this migration. IF lab stones will use these VVS1/VS1-anchored
--   tiers as a placeholder — they will be significantly OVERPRICED above ~4ct
--   relative to actual market IF pricing. Do not use calculate_price()
--   output as the final retail price for large IF lab stones without manual review.
--   FOLLOW-UP REQUIRED: D/IF at 4ct before building an IF-specific path.
--   Tracked in build brief: "IF Lab Stone Path Above 3ct".
--
-- NOTE C — coverage ceiling:
--   Confirmed evidence tops at 8.61ct. Tier 6 (>6ct) is open-ended (NULL upper
--   bound) using the 3.85× plateau confirmed at both 7.06ct and 8.61ct. No
--   separate tier exists above 8.61ct — there are no data points. The 3.85×
--   plateau is applied as the conservative floor for all stones above 6ct.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Replace lab_stone rows
--
-- Uses ON CONFLICT DO UPDATE so this is safe to re-run and works for any
-- tenant that has existing component rules (tenant_id derived from 'metal').
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove any existing lab_stone rows that do NOT match our new tier set
-- (handles the legacy single flat row with carat_min=0, carat_max=NULL, ×11).
DELETE FROM pricing_component_rules
WHERE component_type = 'lab_stone';

-- Insert the 6 evidence-based tiers for every tenant that has a metal rule.
INSERT INTO pricing_component_rules
  (tenant_id, component_type, carat_min, carat_max, multiplier, notes)
SELECT
  tenants.tenant_id,
  'lab_stone',
  tiers.carat_min,
  tiers.carat_max,
  tiers.multiplier,
  tiers.notes
FROM (
  -- Derive tenant set from existing metal rules — every tenant has one.
  SELECT DISTINCT tenant_id FROM pricing_component_rules WHERE component_type = 'metal'
) tenants
CROSS JOIN (VALUES
  -- Tier 1: ≤2ct  — three colour grades agree within 0.05×. Strong anchor.
  (0.000::numeric, 2.000::numeric, 10.5000::numeric,
   '≤2ct lab — D/VVS1 2ct=10.50×; confirmed E/VVS1=10.53×, F/VS1=10.55× (public competitor retail benchmarking Aug-2026)'),

  -- Tier 2: >2–3ct — D/VVS1 only; no E/F cross-check at this size.
  (2.000::numeric, 3.000::numeric, 8.5000::numeric,
   '>2–3ct lab — D/VVS1 3ct=8.47× (public competitor retail benchmarking Aug-2026); single colour grade'),

  -- Tier 3: >3–4ct — D/VVS1 anchor; E/F run ~9.9× here (see NOTE A).
  (3.000::numeric, 4.000::numeric, 7.0000::numeric,
   '>3–4ct lab — D/VVS1 4ct=6.95× (public competitor retail benchmarking Aug-2026); E/VVS1=9.92×, F/VS1=9.96× (D-anchored conservative — see NOTE A in migration 098)'),

  -- Tier 4: >4–5ct — D/VVS1 only.
  (4.000::numeric, 5.000::numeric, 5.5000::numeric,
   '>4–5ct lab — D/VVS1 5ct=5.46× (public competitor retail benchmarking Aug-2026); single colour grade'),

  -- Tier 5: >5–6ct — D/VVS1 anchor; E=6.98×, F=8.48× at 6ct (see NOTE A).
  (5.000::numeric, 6.000::numeric, 4.9000::numeric,
   '>5–6ct lab — D/VVS1 6ct=4.91× (public competitor retail benchmarking Aug-2026); E/VVS1=6.98×, F/VS1=8.48× (D-anchored conservative — see NOTE A in migration 098)'),

  -- Tier 6: >6ct — confirmed plateau at both 7.06ct (3.86×) and 8.61ct (3.85×).
  -- Open-ended (NULL upper bound): no data above 8.61ct, plateau assumed as floor.
  (6.000::numeric, NULL,          3.8500::numeric,
   '>6ct lab plateau — D/VVS1 7.06ct=3.86×, 8.61ct=3.85× (public competitor retail benchmarking Aug-2026); confirmed to 8.61ct, no data above (see NOTE C in migration 098)')

) AS tiers(carat_min, carat_max, multiplier, notes)
ON CONFLICT (tenant_id, component_type, carat_min)
DO UPDATE SET
  carat_max  = EXCLUDED.carat_max,
  multiplier = EXCLUDED.multiplier,
  notes      = EXCLUDED.notes,
  updated_at = now();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Replace calculate_price() — add carat-range lookup for lab_stone
--
-- The only change from migration 097 is in the lab_stone SELECT block:
-- was: WHERE component_type = 'lab_stone' LIMIT 1   (flat, no carat filter)
-- now: same carat_min/carat_max range filter natural_stone already uses.
-- Everything else in the function is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_price(
  p_tenant_id              uuid,
  p_design_id              uuid     DEFAULT NULL,
  p_band_width_mm          numeric  DEFAULT NULL,
  p_metal_karat            text     DEFAULT NULL,
  p_metal_colour           text     DEFAULT NULL,
  p_piece_id               uuid     DEFAULT NULL,
  p_stone_wholesale        numeric  DEFAULT NULL,
  p_stone_carat            numeric  DEFAULT NULL,
  p_stone_origin           text     DEFAULT NULL,
  p_include_melee          boolean  DEFAULT false,
  p_personalisation_retail numeric  DEFAULT 0,
  p_birthstone_retail      numeric  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_mode              text;
  v_gram_weight       numeric;
  v_metal_karat       text;
  v_metal_colour      text;
  v_labour_cost       numeric := 0;
  v_setting_cost      numeric := 0;
  v_melee_included    boolean := false;
  v_metal_type_key    text;
  v_gold_price        numeric;
  v_metal_cost        numeric;
  v_metal_retail      numeric;
  v_labour_retail     numeric;
  v_stone_retail      numeric := 0;
  v_melee_unit_cost   numeric;
  v_melee_retail      numeric := 0;
  v_total_retail      numeric;
  v_metal_mult        numeric;
  v_labour_mult       numeric;
  v_stone_mult        numeric;
  v_melee_mult        numeric;
BEGIN

  -- ── Resolve mode and fetch piece/design data ────────────────────────────────

  IF p_piece_id IS NOT NULL THEN
    v_mode := 'ready_to_wear';

    SELECT
      ip.metal_weight_grams,
      ip.metal_karat,
      ip.metal_colour,
      COALESCE(ipr.labour_cost,  0),
      COALESCE(ipr.setting_cost, 0),
      COALESCE(ipr.melee_included, false)
    INTO
      v_gram_weight, v_metal_karat, v_metal_colour,
      v_labour_cost, v_setting_cost, v_melee_included
    FROM inventory_pieces ip
    LEFT JOIN inventory_products ipr ON ipr.id = ip.product_id
    WHERE ip.id = p_piece_id
      AND ip.tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'piece_not_found', 'piece_id', p_piece_id);
    END IF;

  ELSIF p_design_id IS NOT NULL AND p_band_width_mm IS NOT NULL
        AND p_metal_karat IS NOT NULL THEN
    v_mode := 'made_to_order';

    SELECT
      COALESCE(labour_cost,  0),
      COALESCE(setting_cost, 0),
      COALESCE(melee_included, false)
    INTO v_labour_cost, v_setting_cost, v_melee_included
    FROM inventory_products
    WHERE id = p_design_id
      AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'design_not_found', 'design_id', p_design_id);
    END IF;

    v_metal_karat  := p_metal_karat;
    v_metal_colour := COALESCE(p_metal_colour, 'Yellow');

    SELECT gram_weight INTO v_gram_weight
    FROM design_band_recipes
    WHERE tenant_id = p_tenant_id
      AND design_id = p_design_id
      AND metal_karat = p_metal_karat
      AND band_width_mm = p_band_width_mm
    LIMIT 1;

    IF v_gram_weight IS NULL THEN
      SELECT gram_weight INTO v_gram_weight
      FROM design_band_recipes
      WHERE tenant_id = p_tenant_id
        AND design_id = p_design_id
        AND metal_karat = p_metal_karat
      ORDER BY ABS(band_width_mm - p_band_width_mm)
      LIMIT 1;
    END IF;

    IF v_gram_weight IS NULL THEN
      RETURN jsonb_build_object(
        'error',         'no_recipe_found',
        'design_id',     p_design_id,
        'band_width_mm', p_band_width_mm,
        'metal_karat',   p_metal_karat
      );
    END IF;

  ELSE
    RETURN jsonb_build_object(
      'error', 'invalid_mode',
      'hint',  'Pass p_piece_id for ready-to-wear, or p_design_id + p_band_width_mm + p_metal_karat for made-to-order'
    );
  END IF;

  -- ── Build metal type key ────────────────────────────────────────────────────

  v_metal_type_key := CASE
    WHEN v_metal_karat = '9K'       THEN '9ct '   || initcap(COALESCE(v_metal_colour, 'Yellow')) || ' Gold'
    WHEN v_metal_karat = '18K'      THEN '18ct '  || initcap(COALESCE(v_metal_colour, 'Yellow')) || ' Gold'
    WHEN v_metal_karat = 'Platinum' THEN 'Platinum'
    WHEN v_metal_karat = 'Silver'   THEN 'Sterling Silver'
    ELSE v_metal_karat
  END;

  -- ── Metal price ─────────────────────────────────────────────────────────────

  SELECT price_per_gram INTO v_gold_price
  FROM pricing_metal_rates
  WHERE tenant_id = p_tenant_id
    AND metal_type = v_metal_type_key
  LIMIT 1;

  IF v_gold_price IS NULL THEN
    RETURN jsonb_build_object(
      'error',      'no_metal_rate',
      'metal_type', v_metal_type_key,
      'hint',       'Add a price row in Settings → Pricing → Metal Prices'
    );
  END IF;

  -- ── Multipliers ─────────────────────────────────────────────────────────────

  SELECT multiplier INTO v_metal_mult
  FROM pricing_component_rules
  WHERE tenant_id = p_tenant_id AND component_type = 'metal'
  LIMIT 1;
  v_metal_mult := COALESCE(v_metal_mult, 1.40);

  SELECT multiplier INTO v_labour_mult
  FROM pricing_component_rules
  WHERE tenant_id = p_tenant_id AND component_type = 'labour'
  LIMIT 1;
  v_labour_mult := COALESCE(v_labour_mult, 1.80);

  SELECT multiplier INTO v_melee_mult
  FROM pricing_component_rules
  WHERE tenant_id = p_tenant_id AND component_type = 'melee'
  LIMIT 1;
  v_melee_mult := COALESCE(v_melee_mult, 3.50);

  -- ── Calculate components ────────────────────────────────────────────────────

  v_metal_cost    := COALESCE(v_gram_weight, 0) * v_gold_price;
  v_metal_retail  := v_metal_cost * v_metal_mult;
  v_labour_retail := (v_labour_cost + v_setting_cost) * v_labour_mult;

  IF p_stone_wholesale IS NOT NULL AND p_stone_wholesale > 0 THEN
    IF LOWER(COALESCE(p_stone_origin, 'natural')) = 'lab' THEN
      -- Lab stone: carat-tiered lookup (same range pattern as natural_stone).
      -- NOTE: tiers are D/VVS1-anchored (conservative for E/F at 4ct+).
      -- NOTE: IF clarity uses these same tiers above 3ct — no IF-specific path
      --       exists yet; see migration 098 NOTE B. Large IF stones will be
      --       overpriced by this function until an IF path is shipped.
      SELECT multiplier INTO v_stone_mult
      FROM pricing_component_rules
      WHERE tenant_id = p_tenant_id
        AND component_type = 'lab_stone'
        AND carat_min <= COALESCE(p_stone_carat, 0)
        AND (carat_max IS NULL OR carat_max > COALESCE(p_stone_carat, 0))
      ORDER BY carat_min DESC
      LIMIT 1;
      v_stone_mult := COALESCE(v_stone_mult, 10.50); -- tier-1 rate as safe fallback
    ELSE
      SELECT multiplier INTO v_stone_mult
      FROM pricing_component_rules
      WHERE tenant_id = p_tenant_id
        AND component_type = 'natural_stone'
        AND carat_min <= COALESCE(p_stone_carat, 0)
        AND (carat_max IS NULL OR carat_max > COALESCE(p_stone_carat, 0))
      ORDER BY carat_min DESC
      LIMIT 1;
      v_stone_mult := COALESCE(v_stone_mult, 2.50);
    END IF;
    v_stone_retail := p_stone_wholesale * v_stone_mult;
  END IF;

  IF p_include_melee OR v_melee_included THEN
    SELECT price_per_stone * 20 INTO v_melee_unit_cost
    FROM pricing_melee_stones
    WHERE tenant_id = p_tenant_id
      AND size_label = '0.01ct'
      AND LOWER(stone_type) LIKE '%lab%'
    LIMIT 1;

    IF v_melee_unit_cost IS NULL THEN
      SELECT price_per_stone * 20 INTO v_melee_unit_cost
      FROM pricing_melee_stones
      WHERE tenant_id = p_tenant_id AND size_label = '0.01ct'
      ORDER BY updated_at DESC
      LIMIT 1;
    END IF;

    v_melee_retail := COALESCE(v_melee_unit_cost, 0) * v_melee_mult;
  END IF;

  v_total_retail :=
    v_metal_retail
    + v_labour_retail
    + v_stone_retail
    + v_melee_retail
    + COALESCE(p_personalisation_retail, 0)
    + COALESCE(p_birthstone_retail, 0);

  RETURN jsonb_build_object(
    'mode',                   v_mode,
    'total_retail',           ROUND(v_total_retail, 2),
    'metal_retail',           ROUND(v_metal_retail, 2),
    'labour_retail',          ROUND(v_labour_retail, 2),
    'stone_retail',           ROUND(v_stone_retail, 2),
    'melee_retail',           ROUND(v_melee_retail, 2),
    'personalisation_retail', ROUND(COALESCE(p_personalisation_retail, 0), 2),
    'birthstone_retail',      ROUND(COALESCE(p_birthstone_retail, 0), 2),
    'inputs', jsonb_build_object(
      'gold_price_per_gram', v_gold_price,
      'gram_weight',         v_gram_weight,
      'metal_type_key',      v_metal_type_key,
      'metal_multiplier',    v_metal_mult,
      'labour_multiplier',   v_labour_mult,
      'stone_wholesale',     p_stone_wholesale,
      'stone_carat',         p_stone_carat,
      'stone_origin',        p_stone_origin,
      'stone_multiplier',    v_stone_mult,
      'melee_multiplier',    v_melee_mult
    )
  );

END;
$$;
