-- -----------------------------------------------------------------------------
-- 134: calculate_price() Phase 3 - ad-hoc mode, multi-row melee, flat labour
--      passthrough for ad-hoc mode. Three pieces, agreed with Josh:
--
-- 1. Ad-hoc mode - triggered when neither p_piece_id nor p_design_id is
--    supplied but p_metal_rows is. No lookups against inventory_pieces,
--    inventory_products, or design_band_recipes at all - metal, stone,
--    melee, labour, and addons all come straight from the caller. For
--    staff-typed bespoke items with no catalogued design/piece record.
--
-- 2. p_melee_rows (jsonb array) - mirrors the existing p_metal_rows /
--    p_stone_rows pattern exactly: same ambiguity guard against the
--    single-melee scalar params, same per-row loop resolving independently
--    against pricing_melee_stones, same partial-pricing semantics as
--    p_stone_rows (melee_status is 'ok' only if every row priced, 'no_price'
--    if any row didn't - melee_retail still sums whatever did price).
--    Needed because the quote builder routinely has multiple simultaneous
--    melee rows (e.g. hidden-halo round + band baguette) that the singular
--    p_melee_shape/quality/carat/mm/qty params can't represent.
--
-- 3. p_labour_retail (numeric, flat passthrough) - scoped to ad-hoc mode
--    ONLY. Confirmed with Josh: this is not a fourth unconditional adder
--    like p_personalisation_retail/p_birthstone_retail/p_addons_retail,
--    because the existing 'labour_retail' output field already means
--    something specific (catalogued labour_cost + setting_cost, multiplied)
--    for ready_to_wear/made_to_order calls, and reusing that field for a
--    second, differently-sourced number would be ambiguous, not additive.
--    In ad-hoc mode there is no catalogued labour_cost to multiply in the
--    first place, so p_labour_retail becomes that mode's only source for
--    'labour_retail', taken as-is (no multiplier). In every other mode it
--    is a no-op - the catalogued multiplier calculation is untouched, so
--    no pricing-policy change is smuggled in for anything with a real
--    piece/design record.
--
-- Same-signature-plus-additions change (22 params -> 24, both new params
-- appended at the end with defaults) - the one live caller
-- (app/api/inventory/pieces/[id]/price/route.ts) calls calculate_price via
-- supabase.rpc() with named arguments, so this is fully backward compatible
-- regardless of param order or count.
--
-- Delivered via the temp-name-then-rename pattern (same large-paste-
-- corruption mitigation as migration 133) - PIECE 1 OF 2 below creates the
-- function under a temporary name (calculate_price_v4), safe to retry
-- freely since nothing calls this name yet. The cutover (PIECE 2, a
-- separate DROP + RENAME script) is issued only after staging AND
-- production hand-trace verification, matching every previous RPC change
-- this phase.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_price_v4(
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
  p_metal_rows             jsonb    DEFAULT NULL,
  p_stone_rows             jsonb    DEFAULT NULL,
  p_addons_retail          numeric  DEFAULT 0,
  p_melee_rows             jsonb    DEFAULT NULL,
  p_labour_retail          numeric  DEFAULT 0
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
  v_stone_status       text    := 'none';

  v_comp_rec           RECORD;
  v_comp_gram          numeric;
  v_comp_gold_price    numeric;
  v_comp_metal_key     text;
  v_total_metal_cost   numeric := 0;
  v_total_labour_cost  numeric := 0;
  v_components_arr     jsonb   := '[]'::jsonb;
  v_component_count    integer := 0;

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
  v_stone_rows_all_priced boolean := true;

  -- 134: multi-row melee working vars (mirrors the stone-rows vars above)
  v_melee_rows_total      numeric := 0;
  v_melee_rows_count      integer := 0;
  v_melee_rows_all_priced boolean := true;
  v_row_melee_origin_raw      text;
  v_row_melee_origin_resolved text;
  v_row_melee_shape           text;
  v_row_melee_quality         text;
  v_row_melee_carat           numeric;
  v_row_melee_mm              text;
  v_row_melee_qty             integer;
  v_row_melee_ppc             numeric;
  v_row_melee_pps             numeric;
  v_row_melee_unit_cost       numeric;
BEGIN

  IF p_stone_rows IS NOT NULL AND jsonb_array_length(p_stone_rows) > 0
     AND p_stone_wholesale IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', 'ambiguous_stone_input',
      'hint',  'Pass either p_stone_rows (multi-stone) or p_stone_wholesale/p_stone_carat/p_stone_origin (single stone), not both'
    );
  END IF;

  -- 134: same ambiguity guard as stone, reusing the exact three fields the
  -- rest of this function already treats as "an explicit single melee line
  -- was given" (see the p_melee_shape/p_melee_quality/p_melee_carat check
  -- further down).
  IF p_melee_rows IS NOT NULL AND jsonb_array_length(p_melee_rows) > 0
     AND (p_melee_shape IS NOT NULL OR p_melee_quality IS NOT NULL OR p_melee_carat IS NOT NULL) THEN
    RETURN jsonb_build_object(
      'error', 'ambiguous_melee_input',
      'hint',  'Pass either p_melee_rows (multi-melee) or p_melee_shape/p_melee_quality/p_melee_carat/p_melee_mm/p_melee_qty (single melee line), not both'
    );
  END IF;

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

    SELECT gram_weight INTO v_gram_weight
    FROM design_band_recipes
    WHERE tenant_id     = p_tenant_id
      AND design_id     = p_design_id
      AND dimension_type  = p_dimension_type
      AND dimension_value = p_dimension_value
      AND metal_karat   = p_metal_karat
    LIMIT 1;

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
        'hint',  'Pass p_piece_id for ready-to-wear, p_design_id + p_dimension_type + p_dimension_value + p_metal_karat for made-to-order, p_design_id alone for a composite design with rows in design_components, or p_metal_rows alone (no piece/design) for an ad-hoc bespoke item'
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

  -- 134: ad-hoc mode - neither a piece nor a design given, but metal rows
  -- are. No catalogue lookups at all. Deliberately placed after the
  -- composite branch so an actual p_design_id (even a malformed one) still
  -- takes priority over falling through to ad-hoc.
  ELSIF p_piece_id IS NULL AND p_design_id IS NULL
        AND p_metal_rows IS NOT NULL AND jsonb_array_length(p_metal_rows) > 0 THEN
    v_mode := 'ad_hoc';
    -- v_labour_cost / v_setting_cost / v_supplier_id stay at their zero/NULL
    -- defaults - ad-hoc has no product/piece row to source them from.
    -- Labour for this mode comes from p_labour_retail instead (below).

  ELSE
    RETURN jsonb_build_object(
      'error', 'invalid_mode',
      'hint',  'Pass p_piece_id for ready-to-wear, p_design_id + p_dimension_type + p_dimension_value + p_metal_karat for made-to-order, p_design_id alone for a composite design with rows in design_components, or p_metal_rows alone (no piece/design) for an ad-hoc bespoke item'
    );
  END IF;

  IF v_supplier_id IS NOT NULL THEN
    SELECT gold_rate_override_per_gram INTO v_supplier_gold_rate
    FROM inventory_suppliers
    WHERE id = v_supplier_id;
  END IF;

  IF p_metal_rows IS NULL OR jsonb_array_length(p_metal_rows) = 0 THEN
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

  -- 134: labour_retail is mode-scoped. Ad-hoc has no catalogued labour_cost
  -- to multiply, so p_labour_retail is taken as-is (no multiplier) - this is
  -- the only mode where p_labour_retail has any effect. Every other mode is
  -- byte-identical to before this migration.
  IF v_mode = 'ad_hoc' THEN
    v_labour_retail := COALESCE(p_labour_retail, 0);
  ELSE
    v_labour_retail := (v_labour_cost + v_setting_cost) * v_labour_mult;
  END IF;

  -- Stone cost/retail (133: cost-based tier lookup, explicit no_price status
  -- instead of a silent fallback multiplier when nothing matches)

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
          AND cost_min <= v_row_wholesale
          AND (cost_max IS NULL OR cost_max > v_row_wholesale)
        ORDER BY cost_min DESC
        LIMIT 1;
      ELSE
        SELECT multiplier INTO v_row_stone_mult
        FROM pricing_component_rules
        WHERE tenant_id = p_tenant_id
          AND component_type = 'natural_stone'
          AND cost_min <= v_row_wholesale
          AND (cost_max IS NULL OR cost_max > v_row_wholesale)
        ORDER BY cost_min DESC
        LIMIT 1;
      END IF;

      IF v_row_stone_mult IS NULL THEN
        v_stone_rows_all_priced := false;
      ELSE
        v_stone_rows_total := v_stone_rows_total + (v_row_wholesale * v_row_stone_mult);
      END IF;

      v_row_stone_mult := NULL;
    END LOOP;

    v_stone_retail := v_stone_rows_total;
    v_stone_status := CASE WHEN v_stone_rows_all_priced THEN 'ok' ELSE 'no_price' END;

  ELSIF p_stone_wholesale IS NOT NULL AND p_stone_wholesale > 0 THEN
    -- Single-stone path
    IF LOWER(COALESCE(p_stone_origin, 'natural')) = 'lab' THEN
      SELECT multiplier INTO v_stone_mult
      FROM pricing_component_rules
      WHERE tenant_id = p_tenant_id
        AND component_type = 'lab_stone'
        AND cost_min <= p_stone_wholesale
        AND (cost_max IS NULL OR cost_max > p_stone_wholesale)
      ORDER BY cost_min DESC
      LIMIT 1;
    ELSE
      SELECT multiplier INTO v_stone_mult
      FROM pricing_component_rules
      WHERE tenant_id = p_tenant_id
        AND component_type = 'natural_stone'
        AND cost_min <= p_stone_wholesale
        AND (cost_max IS NULL OR cost_max > p_stone_wholesale)
      ORDER BY cost_min DESC
      LIMIT 1;
    END IF;

    IF v_stone_mult IS NULL THEN
      v_stone_status := 'no_price';
    ELSE
      v_stone_retail := p_stone_wholesale * v_stone_mult;
      v_stone_status := 'ok';
    END IF;
  END IF;

  -- 134: multi-row melee takes priority over the single-melee scalar path,
  -- exactly like p_stone_rows takes priority over p_stone_wholesale above.
  IF p_melee_rows IS NOT NULL AND jsonb_array_length(p_melee_rows) > 0 THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_melee_rows)
    LOOP
      v_melee_rows_count := v_melee_rows_count + 1;

      v_row_melee_origin_raw := v_row ->> 'origin';
      v_row_melee_shape      := v_row ->> 'shape';
      v_row_melee_quality    := v_row ->> 'quality';
      v_row_melee_carat      := NULLIF(v_row ->> 'carat', '')::numeric;
      v_row_melee_mm         := v_row ->> 'mm';
      v_row_melee_qty        := NULLIF(v_row ->> 'qty', '')::integer;

      IF v_row_melee_shape IS NULL OR btrim(v_row_melee_shape) = ''
         OR v_row_melee_quality IS NULL OR btrim(v_row_melee_quality) = ''
         OR v_row_melee_mm IS NULL OR btrim(v_row_melee_mm) = ''
         OR v_row_melee_carat IS NULL OR v_row_melee_carat <= 0
         OR v_row_melee_qty IS NULL OR v_row_melee_qty <= 0
      THEN
        RETURN jsonb_build_object(
          'error',     'invalid_melee_row',
          'row_index', v_melee_rows_count - 1,
          'row',       v_row,
          'hint',      'Each melee row needs shape, quality, mm, a positive carat, and a positive qty'
        );
      END IF;

      v_row_melee_origin_resolved := CASE LOWER(COALESCE(btrim(v_row_melee_origin_raw), ''))
        WHEN 'natural'    THEN 'natural'
        WHEN 'lab'        THEN 'lab'
        WHEN 'lab grown'  THEN 'lab'
        WHEN 'lab-grown'  THEN 'lab'
        ELSE NULL
      END;

      IF v_row_melee_origin_resolved IS NULL THEN
        v_melee_rows_all_priced := false;
      ELSE
        SELECT price_per_carat, price_per_stone
        INTO v_row_melee_ppc, v_row_melee_pps
        FROM pricing_melee_stones
        WHERE tenant_id  = p_tenant_id
          AND origin     = v_row_melee_origin_resolved
          AND size_type  = 'carat_range'
          AND LOWER(shape)   = LOWER(btrim(v_row_melee_shape))
          AND LOWER(quality) = LOWER(btrim(v_row_melee_quality))
          AND mm = normalize_melee_mm(v_row_melee_mm)
          AND size_from <= v_row_melee_carat
          AND size_to   >= v_row_melee_carat
        ORDER BY size_from ASC
        LIMIT 1;

        IF NOT FOUND THEN
          v_melee_rows_all_priced := false;
        ELSE
          v_row_melee_unit_cost := CASE
            WHEN v_row_melee_pps IS NOT NULL AND v_row_melee_pps > 0 THEN v_row_melee_pps
            WHEN v_row_melee_ppc IS NOT NULL THEN v_row_melee_ppc * v_row_melee_carat
            ELSE NULL
          END;

          IF v_row_melee_unit_cost IS NULL THEN
            v_melee_rows_all_priced := false;
          ELSE
            v_melee_rows_total := v_melee_rows_total + (v_row_melee_unit_cost * v_row_melee_qty * v_melee_mult);
          END IF;
        END IF;
      END IF;

      v_row_melee_ppc := NULL;
      v_row_melee_pps := NULL;
      v_row_melee_unit_cost := NULL;
    END LOOP;

    v_melee_retail := v_melee_rows_total;
    v_melee_status := CASE WHEN v_melee_rows_all_priced THEN 'ok' ELSE 'no_price' END;

  ELSIF p_include_melee OR v_melee_included THEN
    IF p_melee_shape IS NOT NULL OR p_melee_quality IS NOT NULL OR p_melee_carat IS NOT NULL THEN
      v_melee_origin_raw := p_melee_origin;
      v_melee_shape      := p_melee_shape;
      v_melee_quality    := p_melee_quality;
      v_melee_carat      := p_melee_carat;
      v_melee_mm         := p_melee_mm;
      v_melee_qty        := COALESCE(p_melee_qty, 1);

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
    'stone_status',           v_stone_status,
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
      'labour_retail_input', p_labour_retail,
      'stone_wholesale',     p_stone_wholesale,
      'stone_carat',         p_stone_carat,
      'stone_origin',        p_stone_origin,
      'stone_multiplier',    v_stone_mult,
      'stone_status',        v_stone_status,
      'stone_rows_count',    v_stone_rows_count,
      'melee_multiplier',    v_melee_mult,
      'melee_origin',        v_melee_origin_resolved,
      'melee_shape',         v_melee_shape,
      'melee_quality',       v_melee_quality,
      'melee_carat',         v_melee_carat,
      'melee_mm',            normalize_melee_mm(v_melee_mm),
      'melee_qty',           v_melee_qty,
      'melee_status',        v_melee_status,
      'melee_rows_count',    v_melee_rows_count,
      'dimension_type',      p_dimension_type,
      'dimension_value',     p_dimension_value
    )
  );

END;
$$;

-- -----------------------------------------------------------------------------
-- PIECE 2 OF 2 (the DROP + RENAME cutover) is issued separately, only after
-- staging AND production hand-trace verification - same pattern as 133/134/135
-- earlier this phase. Not included here.
-- -----------------------------------------------------------------------------
