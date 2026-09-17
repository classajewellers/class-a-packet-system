-- ─────────────────────────────────────────────────────────────────────────────
-- 102: Generalise design_band_recipes — dimension_type + dimension_value
--
-- Problem: design_band_recipes currently only models ring band width. Any other
-- sizing dimension (chain length, bangle diameter, bracelet length, etc.)
-- requires the same gram-weight lookup pattern but has no column to store the
-- dimension type.
--
-- Solution (Option B): add dimension_type text + dimension_value numeric.
-- Existing rows are backfilled with dimension_type = 'band_width_mm' so they
-- remain fully functional. The old band_width_mm column is left in place (not
-- dropped) to avoid breaking inventory_product_variants queries that still
-- read it directly — it is now redundant for design_band_recipes but retained
-- for the variants table, which is a separate concern.
--
-- calculate_price() made-to-order path: p_band_width_mm → p_dimension_type +
-- p_dimension_value. The function is dropped and recreated because changing
-- parameter count/types requires a DROP to avoid creating a stale overload.
-- The ready-to-wear path (p_piece_id) is unchanged.
--
-- Caller blast radius: exactly one TypeScript caller exists
-- (app/api/inventory/pieces/[id]/price/route.ts) and it uses the ready-to-wear
-- path only (passes p_piece_id, never p_band_width_mm) — zero callers updated.
--
-- Targets: production giucusqyobfsdfwwfyue only.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add new columns (nullable first so backfill can run without constraints)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE design_band_recipes
  ADD COLUMN IF NOT EXISTS dimension_type  text,
  ADD COLUMN IF NOT EXISTS dimension_value numeric(10,4);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill: map all existing band_width_mm rows to the new columns
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE design_band_recipes
SET
  dimension_type  = 'band_width_mm',
  dimension_value = band_width_mm
WHERE dimension_type IS NULL
  AND band_width_mm IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Enforce NOT NULL now that every existing row is populated
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE design_band_recipes
  ALTER COLUMN dimension_type  SET NOT NULL,
  ALTER COLUMN dimension_value SET NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Replace the unique constraint
--    Old: (design_id, band_width_mm, metal_karat)
--    New: (design_id, dimension_type, dimension_value, metal_karat)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE design_band_recipes
  DROP CONSTRAINT IF EXISTS design_band_recipes_design_id_band_width_mm_metal_karat_key;

ALTER TABLE design_band_recipes
  ADD CONSTRAINT design_band_recipes_dim_karat_unique
    UNIQUE (design_id, dimension_type, dimension_value, metal_karat);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Index to support efficient dimension-type lookups and closest-match queries
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS design_band_recipes_dim_type_idx
  ON design_band_recipes (design_id, dimension_type, metal_karat);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Drop the old calculate_price() signature before recreating it
--
-- The parameter list changes (removing p_band_width_mm, adding p_dimension_type
-- and p_dimension_value) so CREATE OR REPLACE would create a stale overload
-- rather than replacing the existing function. Drop first.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.calculate_price(
  uuid, uuid, numeric, text, text, uuid, numeric, numeric, text, boolean, numeric, numeric
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. New calculate_price() — p_dimension_type + p_dimension_value replace
--    p_band_width_mm in the made-to-order path.
--
-- Changes from migration 099:
--   a. p_band_width_mm parameter removed.
--   b. p_dimension_type text + p_dimension_value numeric added.
--   c. Made-to-order trigger now requires both p_dimension_type and
--      p_dimension_value (non-null) instead of p_band_width_mm.
--   d. design_band_recipes lookup filters by dimension_type first, then finds
--      the closest dimension_value within that type — cross-type comparisons
--      (e.g. chain_length_cm vs band_width_mm) are impossible.
--   e. Error and inputs objects use 'dimension_type' + 'dimension_value'.
-- Everything else (ready-to-wear path, metal pricing, stones, melee) unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_price(
  p_tenant_id              uuid,
  p_design_id              uuid     DEFAULT NULL,
  p_dimension_type         text     DEFAULT NULL,
  p_dimension_value        numeric  DEFAULT NULL,
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
  v_mode               text;
  v_pricing_method     text    := 'class_a_standard';
  v_supplier_id        uuid;
  v_supplier_gold_rate numeric;
  v_gram_weight        numeric;
  v_metal_karat        text;
  v_metal_colour       text;
  v_labour_cost        numeric := 0;
  v_setting_cost       numeric := 0;
  v_melee_included     boolean := false;
  v_metal_type_key     text;
  v_gold_price         numeric;
  v_metal_cost         numeric;
  v_metal_retail       numeric;
  v_labour_retail      numeric;
  v_stone_retail       numeric := 0;
  v_melee_unit_cost    numeric;
  v_melee_retail       numeric := 0;
  v_total_retail       numeric;
  v_metal_mult         numeric;
  v_labour_mult        numeric;
  v_stone_mult         numeric;
  v_melee_mult         numeric;
BEGIN

  -- ── Resolve mode and fetch piece/design data ────────────────────────────────

  IF p_piece_id IS NOT NULL THEN
    v_mode := 'ready_to_wear';

    SELECT
      ip.metal_weight_grams,
      ip.metal_karat,
      ip.metal_colour,
      COALESCE(ipr.labour_cost,    0),
      COALESCE(ipr.setting_cost,   0),
      COALESCE(ipr.melee_included, false),
      COALESCE(ipr.pricing_method, 'class_a_standard'),
      ipr.supplier_id
    INTO
      v_gram_weight, v_metal_karat, v_metal_colour,
      v_labour_cost, v_setting_cost, v_melee_included,
      v_pricing_method, v_supplier_id
    FROM inventory_pieces ip
    LEFT JOIN inventory_products ipr ON ipr.id = ip.product_id
    WHERE ip.id = p_piece_id
      AND ip.tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'piece_not_found', 'piece_id', p_piece_id);
    END IF;

  ELSIF p_design_id IS NOT NULL AND p_dimension_type IS NOT NULL
        AND p_dimension_value IS NOT NULL AND p_metal_karat IS NOT NULL THEN
    v_mode := 'made_to_order';

    SELECT
      COALESCE(labour_cost,    0),
      COALESCE(setting_cost,   0),
      COALESCE(melee_included, false),
      COALESCE(pricing_method, 'class_a_standard'),
      supplier_id
    INTO v_labour_cost, v_setting_cost, v_melee_included, v_pricing_method, v_supplier_id
    FROM inventory_products
    WHERE id = p_design_id
      AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'design_not_found', 'design_id', p_design_id);
    END IF;

    v_metal_karat  := p_metal_karat;
    v_metal_colour := COALESCE(p_metal_colour, 'Yellow');

    -- Exact match: dimension_type + dimension_value + metal_karat
    SELECT gram_weight INTO v_gram_weight
    FROM design_band_recipes
    WHERE tenant_id    = p_tenant_id
      AND design_id    = p_design_id
      AND dimension_type  = p_dimension_type
      AND dimension_value = p_dimension_value
      AND metal_karat  = p_metal_karat
    LIMIT 1;

    -- Closest match within the same dimension_type — never cross types
    IF v_gram_weight IS NULL THEN
      SELECT gram_weight INTO v_gram_weight
      FROM design_band_recipes
      WHERE tenant_id   = p_tenant_id
        AND design_id   = p_design_id
        AND dimension_type = p_dimension_type
        AND metal_karat = p_metal_karat
      ORDER BY ABS(dimension_value - p_dimension_value)
      LIMIT 1;
    END IF;

    IF v_gram_weight IS NULL THEN
      RETURN jsonb_build_object(
        'error',           'no_recipe_found',
        'design_id',       p_design_id,
        'dimension_type',  p_dimension_type,
        'dimension_value', p_dimension_value,
        'metal_karat',     p_metal_karat
      );
    END IF;

  ELSE
    RETURN jsonb_build_object(
      'error', 'invalid_mode',
      'hint',  'Pass p_piece_id for ready-to-wear, or p_design_id + p_dimension_type + p_dimension_value + p_metal_karat for made-to-order'
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

  -- ── Metal price — supplier override takes priority over live rate ───────────

  IF v_supplier_id IS NOT NULL THEN
    SELECT gold_rate_override_per_gram INTO v_supplier_gold_rate
    FROM inventory_suppliers
    WHERE id = v_supplier_id;
  END IF;

  IF v_supplier_gold_rate IS NOT NULL THEN
    v_gold_price := v_supplier_gold_rate;
  ELSE
    SELECT price_per_gram INTO v_gold_price
    FROM pricing_metal_rates
    WHERE tenant_id  = p_tenant_id
      AND metal_type = v_metal_type_key
    LIMIT 1;

    IF v_gold_price IS NULL THEN
      RETURN jsonb_build_object(
        'error',      'no_metal_rate',
        'metal_type', v_metal_type_key,
        'hint',       'Add a price row in Settings → Pricing → Metal Prices'
      );
    END IF;
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
      SELECT multiplier INTO v_stone_mult
      FROM pricing_component_rules
      WHERE tenant_id = p_tenant_id
        AND component_type = 'lab_stone'
        AND carat_min <= COALESCE(p_stone_carat, 0)
        AND (carat_max IS NULL OR carat_max > COALESCE(p_stone_carat, 0))
      ORDER BY carat_min DESC
      LIMIT 1;
      v_stone_mult := COALESCE(v_stone_mult, 10.50);
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
    WHERE tenant_id   = p_tenant_id
      AND size_label  = '0.01ct'
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
      'pricing_method',      v_pricing_method,
      'gold_price_per_gram', v_gold_price,
      'supplier_gold_rate',  v_supplier_gold_rate,
      'gram_weight',         v_gram_weight,
      'metal_type_key',      v_metal_type_key,
      'metal_multiplier',    v_metal_mult,
      'labour_multiplier',   v_labour_mult,
      'stone_wholesale',     p_stone_wholesale,
      'stone_carat',         p_stone_carat,
      'stone_origin',        p_stone_origin,
      'stone_multiplier',    v_stone_mult,
      'melee_multiplier',    v_melee_mult,
      'dimension_type',      p_dimension_type,
      'dimension_value',     p_dimension_value
    )
  );

END;
$$;
