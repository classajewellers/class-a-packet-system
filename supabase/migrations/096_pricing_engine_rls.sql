-- ─────────────────────────────────────────────────────────────────────────────
-- 096: Pricing Engine RLS + New Config Tables
--
-- 1. Fix calculate_price() — design_band_recipes queries were missing tenant_id filter
-- 2. Add RLS policies for all tables created in 095
--      pricing_component_rules, design_band_recipes,
--      inventory_product_variants, price_calculation_snapshots
-- 3. Create pricing_birthstones — per-tenant birthstone price list
-- 4. Create pricing_personalisation_fees — per-tenant personalisation fee list
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Replace calculate_price() with tenant isolation bug fix
--
-- Bug: both design_band_recipes lookups queried only by design_id + metal_karat,
-- without filtering by tenant_id. A recipe belonging to another tenant could match.
-- Fix: add AND tenant_id = p_tenant_id to both SELECT statements.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_price(
  p_tenant_id             uuid,
  p_design_id             uuid     DEFAULT NULL,
  p_band_width_mm         numeric  DEFAULT NULL,
  p_metal_karat           text     DEFAULT NULL,
  p_metal_colour          text     DEFAULT NULL,
  p_piece_id              uuid     DEFAULT NULL,
  p_stone_wholesale       numeric  DEFAULT NULL,
  p_stone_carat           numeric  DEFAULT NULL,
  p_stone_origin          text     DEFAULT NULL,
  p_include_melee         boolean  DEFAULT false,
  p_personalisation_retail numeric DEFAULT 0,
  p_birthstone_retail      numeric DEFAULT 0
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

    -- Exact band width match first, then closest available
    -- FIX: both queries now include tenant_id = p_tenant_id
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
        'error', 'no_recipe_found',
        'design_id',     p_design_id,
        'band_width_mm', p_band_width_mm,
        'metal_karat',   p_metal_karat
      );
    END IF;

  ELSE
    RETURN jsonb_build_object(
      'error', 'invalid_mode',
      'hint', 'Pass p_piece_id for ready-to-wear, or p_design_id + p_band_width_mm + p_metal_karat for made-to-order'
    );
  END IF;

  -- ── Metal type key ─────────────────────────────────────────────────────────
  v_metal_type_key := CASE
    WHEN v_metal_karat = '9K'       THEN '9ct '  || COALESCE(v_metal_colour, 'Yellow')
    WHEN v_metal_karat = '18K'      THEN '18ct ' || COALESCE(v_metal_colour, 'Yellow')
    WHEN v_metal_karat = 'Platinum' THEN 'Platinum'
    WHEN v_metal_karat = 'Silver'   THEN 'Silver'
    ELSE v_metal_karat
  END;

  -- ── Gold price ─────────────────────────────────────────────────────────────
  SELECT price_per_gram INTO v_gold_price
  FROM pricing_gold_prices
  WHERE tenant_id = p_tenant_id
    AND metal_type = v_metal_type_key
    AND price_per_gram IS NOT NULL
  ORDER BY effective_date DESC
  LIMIT 1;

  IF v_gold_price IS NULL THEN
    RETURN jsonb_build_object(
      'error',      'no_gold_price',
      'metal_type', v_metal_type_key,
      'hint',       'Add a price row in Settings → Pricing Hub → Metal Rates'
    );
  END IF;

  -- ── Multipliers ────────────────────────────────────────────────────────────
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

  -- ── Calculate components ───────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS policies for tables created in 095
--
-- All four tables have RLS enabled but no policies, so authenticated users
-- can't read or write them. Add the standard tenant_isolation policy.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "tenant_isolation" ON pricing_component_rules
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation" ON design_band_recipes
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation" ON inventory_product_variants
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE POLICY "tenant_isolation" ON price_calculation_snapshots
  FOR ALL USING (tenant_id = current_tenant_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pricing_birthstones — per-tenant birthstone price list
--
-- Used by the Ring Builder to look up birthstone cost before passing
-- p_birthstone_retail to calculate_price(). Managers can CRUD this list.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pricing_birthstones (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid         NOT NULL,
  month_number   int          NOT NULL CHECK (month_number BETWEEN 1 AND 12),
  stone_name     text         NOT NULL,
  price_per_stone numeric(10,2) NOT NULL CHECK (price_per_stone >= 0),
  fitting_fee    numeric(10,2) NOT NULL DEFAULT 0 CHECK (fitting_fee >= 0),
  notes          text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, month_number)
);

ALTER TABLE pricing_birthstones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON pricing_birthstones
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE INDEX IF NOT EXISTS pricing_birthstones_tenant_idx
  ON pricing_birthstones (tenant_id);

-- Seed traditional birthstones for Class A
INSERT INTO pricing_birthstones (tenant_id, month_number, stone_name, price_per_stone, fitting_fee) VALUES
  ('00000000-0000-0000-0000-000000000001',  1, 'Garnet',     45.00, 25.00),
  ('00000000-0000-0000-0000-000000000001',  2, 'Amethyst',   35.00, 25.00),
  ('00000000-0000-0000-0000-000000000001',  3, 'Aquamarine', 65.00, 30.00),
  ('00000000-0000-0000-0000-000000000001',  4, 'Diamond',   395.00, 50.00),
  ('00000000-0000-0000-0000-000000000001',  5, 'Emerald',   195.00, 35.00),
  ('00000000-0000-0000-0000-000000000001',  6, 'Pearl',      55.00, 25.00),
  ('00000000-0000-0000-0000-000000000001',  7, 'Ruby',      225.00, 35.00),
  ('00000000-0000-0000-0000-000000000001',  8, 'Peridot',    40.00, 25.00),
  ('00000000-0000-0000-0000-000000000001',  9, 'Sapphire',  195.00, 35.00),
  ('00000000-0000-0000-0000-000000000001', 10, 'Opal',       85.00, 30.00),
  ('00000000-0000-0000-0000-000000000001', 11, 'Topaz',      55.00, 25.00),
  ('00000000-0000-0000-0000-000000000001', 12, 'Tanzanite', 145.00, 30.00)
ON CONFLICT (tenant_id, month_number) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. pricing_personalisation_fees — per-tenant personalisation fee list
--
-- Stores fixed fees (engraving, custom design work, rush fee, etc.)
-- The app layer looks up relevant fees before passing p_personalisation_retail
-- as the sum to calculate_price().
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pricing_personalisation_fees (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid          NOT NULL,
  fee_type    text          NOT NULL,  -- 'engraving', 'custom_design', 'rush', etc.
  description text,
  amount      numeric(10,2) NOT NULL CHECK (amount >= 0),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fee_type)
);

ALTER TABLE pricing_personalisation_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON pricing_personalisation_fees
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE INDEX IF NOT EXISTS pricing_personalisation_fees_tenant_idx
  ON pricing_personalisation_fees (tenant_id);

-- Seed defaults for Class A
INSERT INTO pricing_personalisation_fees (tenant_id, fee_type, description, amount) VALUES
  ('00000000-0000-0000-0000-000000000001', 'engraving',     'Standard text engraving (per ring)', 45.00),
  ('00000000-0000-0000-0000-000000000001', 'custom_design',  'Custom design consultation fee',     95.00),
  ('00000000-0000-0000-0000-000000000001', 'rush',           'Rush turnaround (< 5 business days)', 75.00)
ON CONFLICT (tenant_id, fee_type) DO NOTHING;
