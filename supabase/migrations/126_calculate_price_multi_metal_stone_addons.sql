-- -----------------------------------------------------------------------------
-- 126: calculate_price() - Phase 2: multi-metal rows, multi-stone rows,
-- free-form add-ons passthrough
--
-- Confirmed scope (per Josh's sign-off on the Phase 2 proposal):
--   1. p_metal_rows (jsonb array, optional) - simultaneous metal rows on one
--      piece (e.g. a two-tone ring: 3g yellow + 2g white), summed into
--      metal_retail. Falls back to the existing single-metal path
--      (v_metal_karat/v_metal_colour resolved from the piece/design, as
--      today) when omitted or an empty array - byte-identical behaviour for
--      every current caller. Supplier gold-rate override, when present,
--      applies to every row the same way (whole-piece override, not
--      per-row) - there is no per-metal-row supplier concept anywhere in
--      the schema, so this is deliberately not invented here.
--   2. p_stone_rows (jsonb array, optional) - simultaneous stones within one
--      stone option (e.g. a main stone plus two accent stones), summed into
--      stone_retail, each row independently resolving its own lab/natural
--      tier multiplier (identical tier lookup to the existing single-stone
--      path, just looped per row). Providing BOTH p_stone_rows and the
--      existing single p_stone_wholesale/p_stone_carat/p_stone_origin
--      params is an error (ambiguous_stone_input) rather than silently
--      picking one.
--   3. p_addons_retail (numeric, optional, default 0) - a flat passthrough,
--      identical in kind to the existing p_personalisation_retail /
--      p_birthstone_retail parameters: these are already-priced, staff-typed
--      retail dollar amounts (hand engraving, laser engraving, small
--      settings, free-form named components) with no multiplier or catalog
--      lookup applied. Summed by the caller before the call, same as the
--      other two.
--
-- Explicitly OUT of scope for this migration (confirmed Phase 3, application
-- layer, not calculate_price() itself): multiple STONE OPTIONS (mutually
-- exclusive alternatives, e.g. "Option 1: 1ct round" vs "Option 2: 1.5ct
-- oval"). Each option is independently priced already via the existing
-- single-call shape (now with optional p_stone_rows for what is WITHIN one
-- option) - the app calls calculate_price() once per option. No RPC change
-- needed for that dimension.
--
-- Composite mode is UNCHANGED, same as migrations 104/124 - it already
-- excludes stone and melee entirely (pre-existing, deliberate, out of
-- scope). p_metal_rows / p_stone_rows / p_addons_retail only apply to the
-- shared ready_to_wear / made_to_order path.
--
-- Row shapes (jsonb objects), matching the field names used elsewhere in
-- this function rather than inventing new ones:
--   metal row:  {"karat": "9K", "colour": "Yellow", "weight_grams": 3.0}
--   stone row:  {"wholesale": 500, "carat": 0.5, "origin": "natural"}
-- Missing "colour" defaults to 'Yellow' (matches existing single-metal
-- default). Missing "origin" defaults to 'natural' (matches existing
-- single-stone default via COALESCE(p_stone_origin, 'natural')).
--
-- Delivered ASCII-only from the start, given migration 124's earlier
-- unicode-paste failure on staging. This is a single CREATE OR REPLACE
-- FUNCTION statement and cannot be meaningfully split into smaller runnable
-- pieces (unlike 124, which had two independent functions) - paste and run
-- it as one block, then confirm it persisted via pg_proc before trusting
-- "Success" (same verification step as last time).
-- -----------------------------------------------------------------------------

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
  p_birthstone_retail      numeric  DEFAULT 0,
  p_melee_origin           text     DEFAULT NULL,
  p_melee_shape            text     DEFAULT NULL,
  p_melee_quality          text     DEFAULT NULL,
  p_melee_carat            numeric  DEFAULT NULL,
  p_melee_mm               text     DEFAULT NULL,
  p_melee_qty              integer  DEFAULT NULL,
  -- New in 126 - Phase 2 (all optional; omitted = byte-identical to today)
  p_metal_rows             jsonb    DEFAULT NULL,
  p_stone_rows             jsonb    DEFAULT NULL,
  p_addons_retail          numeric  DEFAULT 0
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

  -- Melee (124) - resolved inputs + lookup result + diagnostic status
  v_melee_origin_raw     text;
  v_melee_origin_resolved text;
  v_melee_shape          text;
  v_melee_quality        text;
  v_melee_carat          numeric;
  v_melee_mm             text;
  v_melee_qty            integer;
  v_melee_status         text := 'none';
  v_melee_ppc            numeric;
  v_melee_pps            numeric;
  v_melee_unit_cost      numeric;

  -- Multi-metal / multi-stone rows (126)
  v_row                   jsonb;
  v_row_karat             text;
  v_row_colour            text;
  v_row_weight            numeric;
  v_row_metal_key         text;
  v_row_gold_price        numeric;
  v_metal_rows_total_cost numeric := 0;
  v_metal_rows_count      integer := 0;

  v_row_wholesale         numeric;
  v_row_carat             numeric;
  v_row_origin            text;
  v_row_stone_mult        numeric;
  v_stone_rows_total      numeric := 0;
  v_stone_rows_count      integer := 0;
BEGIN

  -- Input validation independent of mode (126)

  IF p_stone_rows IS NOT NULL AND jsonb_array_length(p_stone_rows) > 0
     AND p_stone_wholesale IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', 'ambiguous_stone_input',
      'hint',  'Pass either p_stone_rows (multi-stone) or p_stone_wholesale/p_stone_carat/p_stone_origin (single stone), not both'
    );
  END IF;

  -- Resolve mode and fetch piece/design data

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
    -- Composite mode
    -- UNCHANGED by this migration - stone/melee/addons remain explicitly
    -- excluded, pre-existing behaviour, not in scope for Phase 2.

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

    IF v_supplier_id IS NOT NULL THEN
      SELECT gold_rate_override_per_gram INTO v_supplier_gold_rate
      FROM inventory_suppliers
      WHERE id = v_supplier_id;
    END IF;

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
      'note',                   'Stone costs not included in composite pricing - add manually at quote time',
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

  -- Shared path: ready_to_wear and made_to_order
  -- (composite returns early above)

  -- Supplier override - whole-piece; applies to every metal row the same
  -- way (126: no per-metal-row supplier concept exists anywhere in the
  -- schema, so this stays a single, shared lookup)

  IF v_supplier_id IS NOT NULL THEN
    SELECT gold_rate_override_per_gram INTO v_supplier_gold_rate
    FROM inventory_suppliers
    WHERE id = v_supplier_id;
  END IF;

  IF p_metal_rows IS NULL OR jsonb_array_length(p_metal_rows) = 0 THEN
    -- Single-metal path - unchanged behaviour for every current caller

    v_metal_type_key := CASE
      WHEN v_metal_karat = '9K'       THEN '9ct '   || initcap(COALESCE(v_metal_colour, 'Yellow')) || ' Gold'
      WHEN v_metal_karat = '18K'      THEN '18ct '  || initcap(COALESCE(v_metal_colour, 'Yellow')) || ' Gold'
      WHEN v_metal_karat = 'Platinum' THEN 'Platinum'
      WHEN v_metal_karat = 'Silver'   THEN 'Sterling Silver'
      ELSE v_metal_karat
    END;

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
          'hint',       'Add a price row in Settings -> Pricing -> Metal Prices'
        );
      END IF;
    END IF;
  END IF;

  -- Multipliers

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

  -- Metal cost/retail (126: multi-row sum, or the existing single path)

  IF p_metal_rows IS NOT NULL AND jsonb_array_length(p_metal_rows) > 0 THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_metal_rows)
    LOOP
      v_metal_rows_count := v_metal_rows_count + 1;

      v_row_karat  := v_row ->> 'karat';
      v_row_colour := COALESCE(v_row ->> 'colour', 'Yellow');
      v_row_weight := NULLIF(v_row ->> 'weight_grams', '')::numeric;

      IF v_row_karat IS NULL OR v_row_weight IS NULL OR v_row_weight <= 0 THEN
        RETURN jsonb_build_object(
          'error',     'invalid_metal_row',
          'row_index', v_metal_rows_count - 1,
          'row',       v_row,
          'hint',      'Each metal row needs karat and a positive weight_grams'
        );
      END IF;

      v_row_metal_key := CASE
        WHEN v_row_karat = '9K'       THEN '9ct '   || initcap(v_row_colour) || ' Gold'
        WHEN v_row_karat = '18K'      THEN '18ct '  || initcap(v_row_colour) || ' Gold'
        WHEN v_row_karat = 'Platinum' THEN 'Platinum'
        WHEN v_row_karat = 'Silver'   THEN 'Sterling Silver'
        ELSE v_row_karat
      END;

      IF v_supplier_gold_rate IS NOT NULL THEN
        v_row_gold_price := v_supplier_gold_rate;
      ELSE
        SELECT price_per_gram INTO v_row_gold_price
        FROM pricing_metal_rates
        WHERE tenant_id  = p_tenant_id
          AND metal_type = v_row_metal_key
        LIMIT 1;

        IF v_row_gold_price IS NULL THEN
          RETURN jsonb_build_object(
            'error',      'no_metal_rate_for_row',
            'row_index',  v_metal_rows_count - 1,
            'metal_type', v_row_metal_key,
            'hint',       'Add a price row in Settings -> Pricing -> Metal Prices'
          );
        END IF;
      END IF;

      v_metal_rows_total_cost := v_metal_rows_total_cost + (v_row_weight * v_row_gold_price);
    END LOOP;

    v_metal_cost   := v_metal_rows_total_cost;
    v_metal_retail := v_metal_cost * v_metal_mult;
  ELSE
    v_metal_cost    := COALESCE(v_gram_weight, 0) * v_gold_price;
    v_metal_retail  := v_metal_cost * v_metal_mult;
  END IF;

  v_labour_retail := (v_labour_cost + v_setting_cost) * v_labour_mult;

  -- Stone cost/retail (126: multi-row sum, or the existing single path)
  -- (ambiguous_stone_input already ruled out both being supplied at once)

  IF p_stone_rows IS NOT NULL AND jsonb_array_length(p_stone_rows) > 0 THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_stone_rows)
    LOOP
      v_stone_rows_count := v_stone_rows_count + 1;

      v_row_wholesale := NULLIF(v_row ->> 'wholesale', '')::numeric;
      v_row_carat     := NULLIF(v_row ->> 'carat', '')::numeric;
      v_row_origin    := COALESCE(v_row ->> 'origin', 'natural');

      IF v_row_wholesale IS NULL OR v_row_wholesale <= 0 THEN
        RETURN jsonb_build_object(
          'error',     'invalid_stone_row',
          'row_index', v_stone_rows_count - 1,
          'row',       v_row,
          'hint',      'Each stone row needs a positive wholesale value'
        );
      END IF;

      IF LOWER(v_row_origin) = 'lab' THEN
        SELECT multiplier INTO v_row_stone_mult
        FROM pricing_component_rules
        WHERE tenant_id = p_tenant_id
          AND component_type = 'lab_stone'
          AND carat_min <= COALESCE(v_row_carat, 0)
          AND (carat_max IS NULL OR carat_max > COALESCE(v_row_carat, 0))
        ORDER BY carat_min DESC
        LIMIT 1;
        v_row_stone_mult := COALESCE(v_row_stone_mult, 10.50);
      ELSE
        SELECT multiplier INTO v_row_stone_mult
        FROM pricing_component_rules
        WHERE tenant_id = p_tenant_id
          AND component_type = 'natural_stone'
          AND carat_min <= COALESCE(v_row_carat, 0)
          AND (carat_max IS NULL OR carat_max > COALESCE(v_row_carat, 0))
        ORDER BY carat_min DESC
        LIMIT 1;
        v_row_stone_mult := COALESCE(v_row_stone_mult, 2.50);
      END IF;

      v_stone_rows_total := v_stone_rows_total + (v_row_wholesale * v_row_stone_mult);
    END LOOP;

    v_stone_retail := v_stone_rows_total;

  ELSIF p_stone_wholesale IS NOT NULL AND p_stone_wholesale > 0 THEN
    -- Single-stone path - unchanged behaviour for every current caller
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

  -- Melee (124 - real mm-precise, quality-direct pricing; unchanged in 126)

  IF p_include_melee OR v_melee_included THEN
    -- Priority 1: explicit params (future callers with no saved piece row -
    -- e.g. the quote builder in Phase 3).
    IF p_melee_shape IS NOT NULL OR p_melee_quality IS NOT NULL OR p_melee_carat IS NOT NULL THEN
      v_melee_origin_raw := p_melee_origin;
      v_melee_shape      := p_melee_shape;
      v_melee_quality    := p_melee_quality;
      v_melee_carat      := p_melee_carat;
      v_melee_mm         := p_melee_mm;
      v_melee_qty        := COALESCE(p_melee_qty, 1);

    -- Priority 2: ready_to_wear falls back to the piece's OWN real melee
    -- fields - no application code change needed for the existing caller.
    ELSIF v_mode = 'ready_to_wear' THEN
      SELECT
        diamond_type,
        melee_shape,
        COALESCE(
          NULLIF(btrim(melee_quality), ''),
          CASE WHEN melee_colour_group IS NOT NULL AND melee_clarity IS NOT NULL
               THEN melee_colour_group || ' ' || melee_clarity END
        ),
        melee_carat_weight,
        melee_mm,
        melee_quantity
      INTO
        v_melee_origin_raw, v_melee_shape, v_melee_quality,
        v_melee_carat, v_melee_mm, v_melee_qty
      FROM inventory_pieces
      WHERE id = p_piece_id AND tenant_id = p_tenant_id;
    END IF;

    -- Origin resolution - strict, mirrors resolveMeleeOrigin(): never guesses.
    v_melee_origin_resolved := CASE LOWER(COALESCE(btrim(v_melee_origin_raw), ''))
      WHEN 'natural'    THEN 'natural'
      WHEN 'lab'        THEN 'lab'
      WHEN 'lab grown'  THEN 'lab'
      WHEN 'lab-grown'  THEN 'lab'
      ELSE NULL
    END;

    IF v_melee_origin_resolved IS NULL THEN
      v_melee_status := CASE
        WHEN v_melee_origin_raw IS NULL OR btrim(v_melee_origin_raw) = ''
             OR LOWER(btrim(v_melee_origin_raw)) = 'none'
        THEN 'no_origin'
        ELSE 'origin_unrecognized'
      END;

    ELSIF v_melee_qty IS NULL OR v_melee_qty <= 0
       OR v_melee_carat IS NULL OR v_melee_carat <= 0
       OR v_melee_mm IS NULL OR btrim(v_melee_mm) = ''
       OR v_melee_shape IS NULL OR btrim(v_melee_shape) = ''
       OR v_melee_quality IS NULL OR btrim(v_melee_quality) = ''
    THEN
      v_melee_status := 'incomplete';

    ELSE
      -- Exact price-list row: same logic as lib/melee-pricing.ts's priceMelee()
      -- - origin + shape + quality (case-insensitive, direct - no map) +
      -- carat within band + EXACT canonicalized mm.
      SELECT price_per_carat, price_per_stone
      INTO v_melee_ppc, v_melee_pps
      FROM pricing_melee_stones
      WHERE tenant_id  = p_tenant_id
        AND origin     = v_melee_origin_resolved
        AND size_type  = 'carat_range'
        AND LOWER(shape)   = LOWER(btrim(v_melee_shape))
        AND LOWER(quality) = LOWER(btrim(v_melee_quality))
        AND mm = normalize_melee_mm(v_melee_mm)
        AND size_from <= v_melee_carat
        AND size_to   >= v_melee_carat
      ORDER BY size_from ASC
      LIMIT 1;

      IF NOT FOUND THEN
        v_melee_status := 'no_price';
      ELSE
        v_melee_unit_cost := CASE
          WHEN v_melee_pps IS NOT NULL AND v_melee_pps > 0 THEN v_melee_pps
          WHEN v_melee_ppc IS NOT NULL THEN v_melee_ppc * v_melee_carat
          ELSE NULL
        END;

        IF v_melee_unit_cost IS NULL THEN
          v_melee_status := 'no_price';
        ELSE
          v_melee_retail := v_melee_unit_cost * v_melee_qty * v_melee_mult;
          v_melee_status := 'ok';
        END IF;
      END IF;
    END IF;
  END IF;

  v_total_retail :=
    v_metal_retail
    + v_labour_retail
    + v_stone_retail
    + v_melee_retail
    + COALESCE(p_personalisation_retail, 0)
    + COALESCE(p_birthstone_retail, 0)
    + COALESCE(p_addons_retail, 0);

  RETURN jsonb_build_object(
    'mode',                   v_mode,
    'total_retail',           ROUND(v_total_retail, 2),
    'metal_retail',           ROUND(v_metal_retail, 2),
    'labour_retail',          ROUND(v_labour_retail, 2),
    'stone_retail',           ROUND(v_stone_retail, 2),
    'melee_retail',           ROUND(v_melee_retail, 2),
    'melee_status',           v_melee_status,
    'personalisation_retail', ROUND(COALESCE(p_personalisation_retail, 0), 2),
    'birthstone_retail',      ROUND(COALESCE(p_birthstone_retail, 0), 2),
    'addons_retail',          ROUND(COALESCE(p_addons_retail, 0), 2),
    'inputs', jsonb_build_object(
      'pricing_method',      v_pricing_method,
      'gold_price_per_gram', v_gold_price,
      'supplier_gold_rate',  v_supplier_gold_rate,
      'gram_weight',         v_gram_weight,
      'metal_type_key',      v_metal_type_key,
      'metal_multiplier',    v_metal_mult,
      'metal_rows_count',    v_metal_rows_count,
      'labour_multiplier',   v_labour_mult,
      'stone_wholesale',     p_stone_wholesale,
      'stone_carat',         p_stone_carat,
      'stone_origin',        p_stone_origin,
      'stone_multiplier',    v_stone_mult,
      'stone_rows_count',    v_stone_rows_count,
      'melee_multiplier',    v_melee_mult,
      'melee_origin',        v_melee_origin_resolved,
      'melee_shape',         v_melee_shape,
      'melee_quality',       v_melee_quality,
      'melee_carat',         v_melee_carat,
      'melee_mm',            normalize_melee_mm(v_melee_mm),
      'melee_qty',           v_melee_qty,
      'melee_status',        v_melee_status,
      'dimension_type',      p_dimension_type,
      'dimension_value',     p_dimension_value
    )
  );

END;
$$;
