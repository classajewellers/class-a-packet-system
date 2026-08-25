-- ─────────────────────────────────────────────────────────────────────────────
-- 097: Consolidate metal price source of truth
--
-- Problem: calculate_price() reads from pricing_gold_prices, which:
--   (a) uses a different key format ("18ct_yellow") than pricing_metal_rates
--       ("18ct Yellow Gold"), so it NEVER matched — the function always returned
--       {"error": "no_gold_price"}
--   (b) has stale placeholder values from June 2026 (~3× below real market rates)
--
-- Fix:
--   1. Add tenant_id to pricing_metal_rates (backfill Class A, add constraints + RLS)
--   2. Replace calculate_price() to read from pricing_metal_rates instead
--   3. Leave pricing_gold_prices in place — just stop reading from it
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Make pricing_metal_rates multi-tenant
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pricing_metal_rates ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE pricing_metal_rates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE pricing_metal_rates ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE pricing_metal_rates DROP CONSTRAINT IF EXISTS pricing_metal_rates_metal_type_key;
ALTER TABLE pricing_metal_rates DROP CONSTRAINT IF EXISTS pricing_metal_rates_tenant_metal_key;
ALTER TABLE pricing_metal_rates ADD CONSTRAINT pricing_metal_rates_tenant_metal_key UNIQUE (tenant_id, metal_type);

CREATE INDEX IF NOT EXISTS pricing_metal_rates_tenant_idx ON pricing_metal_rates (tenant_id);

ALTER TABLE pricing_metal_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON pricing_metal_rates;
CREATE POLICY "tenant_isolation" ON pricing_metal_rates
  FOR ALL USING (tenant_id = current_tenant_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Replace calculate_price() — read from pricing_metal_rates
--
-- pricing_metal_rates uses full descriptive keys:
--   '9ct Yellow Gold', '9ct White Gold', '9ct Rose Gold',
--   '18ct Yellow Gold', '18ct White Gold', '18ct Rose Gold',
--   'Platinum', 'Sterling Silver'
--
-- We build v_metal_type_key to match those exact strings.
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

  -- ── Build metal type key to match pricing_metal_rates.metal_type format ────
  --
  -- pricing_metal_rates uses: '9ct Yellow Gold', '18ct White Gold', 'Platinum', etc.
  -- Colour is 'Yellow' | 'White' | 'Rose' (first letter capitalised).
  --
  v_metal_type_key := CASE
    WHEN v_metal_karat = '9K'       THEN '9ct '   || initcap(COALESCE(v_metal_colour, 'Yellow')) || ' Gold'
    WHEN v_metal_karat = '18K'      THEN '18ct '  || initcap(COALESCE(v_metal_colour, 'Yellow')) || ' Gold'
    WHEN v_metal_karat = 'Platinum' THEN 'Platinum'
    WHEN v_metal_karat = 'Silver'   THEN 'Sterling Silver'
    ELSE v_metal_karat
  END;

  -- ── Metal price — now reads from pricing_metal_rates ──────────────────────
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

  -- ── Multipliers from pricing_component_rules ────────────────────────────────
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
      SELECT multiplier INTO v_stone_mult
      FROM pricing_component_rules
      WHERE tenant_id = p_tenant_id AND component_type = 'lab_stone'
      LIMIT 1;
      v_stone_mult := COALESCE(v_stone_mult, 11.0);
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
