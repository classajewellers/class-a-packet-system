-- ─────────────────────────────────────────────────────────────────────────────
-- 104: Composite pricing — design_components + calculate_price() composite mode
--
-- Adds the ability for one Design (e.g. Ariel Shell Necklace) to reference
-- one or more other Designs as physical components (e.g. Chain Design +
-- Pendant Design). calculate_price() gains a new 'composite' mode that sums
-- the raw COSTS of each component and applies ONE markup — no double-margin.
--
-- Scope limits (intentional, not oversights):
--   • Stone costs are not included in composite pricing — add manually at
--     quote time. The function returns a note in the output.
--   • Composite-of-composites (multi-level nesting) is not supported.
--     If a component_design_id itself has design_components rows, those are
--     ignored — flat one level only.
--   • Each component appears at most once per parent (UNIQUE on
--     parent_design_id, component_design_id).
--
-- calculate_price() composite trigger:
--   p_design_id IS NOT NULL, p_piece_id IS NULL, p_dimension_type IS NULL
--   Function queries design_components; if rows found → composite mode,
--   otherwise → invalid_mode error (same as before).
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. design_components join table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS design_components (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  parent_design_id     uuid        NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  component_design_id  uuid        NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  dimension_type       text        NOT NULL,
  dimension_value      numeric(10,4) NOT NULL,
  metal_karat          text        NOT NULL,
  metal_colour         text        NOT NULL DEFAULT 'Yellow',
  sort_order           integer     NOT NULL DEFAULT 0,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_design_id != component_design_id),
  UNIQUE (parent_design_id, component_design_id)
);

ALTER TABLE design_components DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS design_components_parent_idx
  ON design_components (tenant_id, parent_design_id);

CREATE INDEX IF NOT EXISTS design_components_component_idx
  ON design_components (tenant_id, component_design_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. calculate_price() — add composite mode
--
-- Signature is unchanged from migration 102 — CREATE OR REPLACE is safe.
--
-- New branch: p_design_id IS NOT NULL, p_piece_id IS NULL,
--             p_dimension_type IS NULL
--   → queries design_components for the parent design
--   → if components found: composite mode (new)
--   → if no components found: returns invalid_mode error (existing behaviour)
--
-- Composite cost accumulation:
--   For each component row in design_components:
--     metal_cost_i   = gram_weight_i × gold_price_i
--     labour_cost_i  = component.labour_cost + component.setting_cost
--   Plus parent design's own labour_cost as assembly cost.
--
--   gold_price per component: if parent has supplier_id with a
--   gold_rate_override_per_gram, use that for every component; otherwise
--   look up pricing_metal_rates by each component's metal_type_key.
--
--   One markup applied to totals:
--     metal_retail  = total_metal_cost  × metal_multiplier
--     labour_retail = total_labour_cost × labour_multiplier
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

  -- Composite mode variables
  v_comp_rec           RECORD;
  v_comp_gram          numeric;
  v_comp_gold_price    numeric;
  v_comp_metal_key     text;
  v_total_metal_cost   numeric := 0;
  v_total_labour_cost  numeric := 0;
  v_components_arr     jsonb   := '[]'::jsonb;
  v_component_count    integer := 0;
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

    -- Exact match
    SELECT gram_weight INTO v_gram_weight
    FROM design_band_recipes
    WHERE tenant_id     = p_tenant_id
      AND design_id     = p_design_id
      AND dimension_type  = p_dimension_type
      AND dimension_value = p_dimension_value
      AND metal_karat   = p_metal_karat
    LIMIT 1;

    -- Closest match within same dimension_type
    IF v_gram_weight IS NULL THEN
      SELECT gram_weight INTO v_gram_weight
      FROM design_band_recipes
      WHERE tenant_id      = p_tenant_id
        AND design_id      = p_design_id
        AND dimension_type = p_dimension_type
        AND metal_karat    = p_metal_karat
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

  ELSIF p_design_id IS NOT NULL AND p_piece_id IS NULL AND p_dimension_type IS NULL THEN
    -- ── Composite mode ────────────────────────────────────────────────────────

    -- Fetch parent design for assembly labour + supplier override
    SELECT
      COALESCE(labour_cost,    0),
      COALESCE(pricing_method, 'class_a_standard'),
      supplier_id
    INTO v_labour_cost, v_pricing_method, v_supplier_id
    FROM inventory_products
    WHERE id = p_design_id
      AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'design_not_found', 'design_id', p_design_id);
    END IF;

    -- Check for supplier gold rate override on parent design
    IF v_supplier_id IS NOT NULL THEN
      SELECT gold_rate_override_per_gram INTO v_supplier_gold_rate
      FROM inventory_suppliers
      WHERE id = v_supplier_id;
    END IF;

    -- Fetch multipliers once (applied to totals at the end)
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

    -- Accumulate costs from each component
    FOR v_comp_rec IN
      SELECT
        dc.component_design_id,
        dc.dimension_type,
        dc.dimension_value,
        dc.metal_karat,
        dc.metal_colour,
        dc.notes,
        COALESCE(ip.labour_cost,  0) AS comp_labour_cost,
        COALESCE(ip.setting_cost, 0) AS comp_setting_cost,
        ip.name AS comp_name
      FROM design_components dc
      JOIN inventory_products ip ON ip.id = dc.component_design_id
      WHERE dc.parent_design_id = p_design_id
        AND dc.tenant_id        = p_tenant_id
      ORDER BY dc.sort_order, dc.created_at
    LOOP
      v_component_count := v_component_count + 1;

      -- Gram weight: exact match first, then closest within dimension_type
      SELECT gram_weight INTO v_comp_gram
      FROM design_band_recipes
      WHERE tenant_id     = p_tenant_id
        AND design_id     = v_comp_rec.component_design_id
        AND dimension_type  = v_comp_rec.dimension_type
        AND dimension_value = v_comp_rec.dimension_value
        AND metal_karat   = v_comp_rec.metal_karat
      LIMIT 1;

      IF v_comp_gram IS NULL THEN
        SELECT gram_weight INTO v_comp_gram
        FROM design_band_recipes
        WHERE tenant_id      = p_tenant_id
          AND design_id      = v_comp_rec.component_design_id
          AND dimension_type = v_comp_rec.dimension_type
          AND metal_karat    = v_comp_rec.metal_karat
        ORDER BY ABS(dimension_value - v_comp_rec.dimension_value)
        LIMIT 1;
      END IF;

      IF v_comp_gram IS NULL THEN
        RETURN jsonb_build_object(
          'error',                'no_recipe_for_component',
          'component_design_id', v_comp_rec.component_design_id,
          'component_name',      v_comp_rec.comp_name,
          'dimension_type',      v_comp_rec.dimension_type,
          'dimension_value',     v_comp_rec.dimension_value,
          'metal_karat',         v_comp_rec.metal_karat
        );
      END IF;

      -- Gold price: parent supplier override (if set) else live rate per component karat
      IF v_supplier_gold_rate IS NOT NULL THEN
        v_comp_gold_price := v_supplier_gold_rate;
      ELSE
        v_comp_metal_key := CASE
          WHEN v_comp_rec.metal_karat = '9K'       THEN '9ct '  || initcap(v_comp_rec.metal_colour) || ' Gold'
          WHEN v_comp_rec.metal_karat = '18K'      THEN '18ct ' || initcap(v_comp_rec.metal_colour) || ' Gold'
          WHEN v_comp_rec.metal_karat = 'Platinum' THEN 'Platinum'
          WHEN v_comp_rec.metal_karat = 'Silver'   THEN 'Sterling Silver'
          ELSE v_comp_rec.metal_karat
        END;

        SELECT price_per_gram INTO v_comp_gold_price
        FROM pricing_metal_rates
        WHERE tenant_id  = p_tenant_id
          AND metal_type = v_comp_metal_key
        LIMIT 1;

        IF v_comp_gold_price IS NULL THEN
          RETURN jsonb_build_object(
            'error',                'no_metal_rate_for_component',
            'component_design_id', v_comp_rec.component_design_id,
            'component_name',      v_comp_rec.comp_name,
            'metal_type',          v_comp_metal_key
          );
        END IF;
      END IF;

      v_total_metal_cost  := v_total_metal_cost
                             + (v_comp_gram * v_comp_gold_price);
      v_total_labour_cost := v_total_labour_cost
                             + v_comp_rec.comp_labour_cost
                             + v_comp_rec.comp_setting_cost;

      v_components_arr := v_components_arr || jsonb_build_array(jsonb_build_object(
        'component_design_id', v_comp_rec.component_design_id,
        'name',                v_comp_rec.comp_name,
        'dimension_type',      v_comp_rec.dimension_type,
        'dimension_value',     v_comp_rec.dimension_value,
        'metal_karat',         v_comp_rec.metal_karat,
        'metal_colour',        v_comp_rec.metal_colour,
        'gram_weight',         v_comp_gram,
        'gold_price_per_gram', v_comp_gold_price,
        'metal_cost',          ROUND(v_comp_gram * v_comp_gold_price, 4),
        'labour_cost',         v_comp_rec.comp_labour_cost + v_comp_rec.comp_setting_cost
      ));
    END LOOP;

    IF v_component_count = 0 THEN
      RETURN jsonb_build_object(
        'error', 'invalid_mode',
        'hint',  'Pass p_piece_id for ready-to-wear, p_design_id + p_dimension_type + p_dimension_value + p_metal_karat for made-to-order, or p_design_id alone for a composite design with rows in design_components'
      );
    END IF;

    -- Add parent design's assembly labour to totals
    v_total_labour_cost := v_total_labour_cost + v_labour_cost;

    v_metal_retail  := v_total_metal_cost  * v_metal_mult;
    v_labour_retail := v_total_labour_cost * v_labour_mult;
    v_total_retail  :=
      v_metal_retail
      + v_labour_retail
      + COALESCE(p_personalisation_retail, 0)
      + COALESCE(p_birthstone_retail, 0);

    RETURN jsonb_build_object(
      'mode',                   'composite',
      'total_retail',           ROUND(v_total_retail, 2),
      'metal_retail',           ROUND(v_metal_retail, 2),
      'labour_retail',          ROUND(v_labour_retail, 2),
      'stone_retail',           0,
      'melee_retail',           0,
      'personalisation_retail', ROUND(COALESCE(p_personalisation_retail, 0), 2),
      'birthstone_retail',      ROUND(COALESCE(p_birthstone_retail, 0), 2),
      'note',                   'Stone costs not included in composite pricing — add manually at quote time',
      'inputs', jsonb_build_object(
        'pricing_method',       v_pricing_method,
        'supplier_gold_rate',   v_supplier_gold_rate,
        'metal_multiplier',     v_metal_mult,
        'labour_multiplier',    v_labour_mult,
        'total_metal_cost',     ROUND(v_total_metal_cost, 4),
        'total_labour_cost',    ROUND(v_total_labour_cost, 4),
        'assembly_labour',      ROUND(v_labour_cost, 4),
        'component_count',      v_component_count,
        'components',           v_components_arr
      )
    );

  ELSE
    RETURN jsonb_build_object(
      'error', 'invalid_mode',
      'hint',  'Pass p_piece_id for ready-to-wear, p_design_id + p_dimension_type + p_dimension_value + p_metal_karat for made-to-order, or p_design_id alone for a composite design with rows in design_components'
    );
  END IF;

  -- ── Shared path: ready_to_wear and made_to_order ────────────────────────────
  -- (composite returns early above)

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
