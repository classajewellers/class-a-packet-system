-- -----------------------------------------------------------------------------
-- 124: calculate_price() - real melee pricing (Phase 1 of the quote-builder
-- migration to calculate_price(), per Josh's phased plan)
--
-- Replaces the placeholder melee logic that has existed since 095/104:
--   `size_label = '0.01ct' AND stone_type LIKE '%lab%'` x 20
-- - a single hardcoded lookup completely disconnected from the real,
-- mm-precise, quality-direct melee model shipped in migrations 105-122
-- (origin/shape/quality/carat/mm, no supplier concept, no colour+clarity map).
-- The old logic never used the piece's own melee_* fields, never varied by
-- quantity, and would return the same fake cost regardless of what melee was
-- actually on the item. NOTE FOR STAGING: calculate_price() did not exist as a
-- function on staging at all before this migration (confirmed via a live RPC
-- probe: PGRST202, no match under any signature) - migration 123 only fixed
-- the tables/columns the function reads; this is the first migration that
-- actually deploys the function there. This is therefore a fresh CREATE, not
-- a behavioural "before" to diff against, on staging specifically.
--
-- Redelivered as ASCII-only (no em-dashes, curly quotes, x/<=/->) after
-- migration 124's original unicode-heavy version silently failed to persist
-- when pasted into the Supabase SQL editor (diagnosed via pg_proc + a probe
-- function - session/connection were fine, so the cause was narrowed to
-- paste corruption from length + unicode). This version is logic-identical.
--
-- New behaviour:
--   - Two ways to supply melee inputs, in priority order:
--     1. Explicit p_melee_* parameters (for future callers - e.g. Phase 3's
--        quote builder - that have real per-line melee data with no saved
--        piece row to read from).
--     2. Ready-to-wear mode only: falls back to the PIECE'S OWN real melee
--        columns (melee_shape, melee_quantity, melee_carat_weight, melee_mm,
--        and melee_quality - or, for pieces saved before migration 122, the
--        legacy melee_colour_group + melee_clarity composed the same way
--        lib/melee-pricing.ts's resolvePieceMeleeQuality() does). This means
--        the ONE real caller today (the piece price route / Live Pricing
--        panel) gets correct melee pricing the moment this migration ships -
--        no application code change required.
--   - The actual price lookup mirrors lib/melee-pricing.ts's priceMelee()
--     exactly: tenant + origin + shape (case-insensitive) + quality
--     (case-insensitive, matched directly - no quality-map, per migration
--     122) + carat within [size_from, size_to] + EXACT mm match, preferring
--     the real price_per_stone over price_per_carat x carat.
--   - mm matching requires the SAME canonicalization lib/melee-pricing.ts's
--     normalizeMm() applies ("0.9"/"0.90" both -> "0.90"), or a piece/param
--     using a differently-formatted but equivalent mm would silently fail to
--     match. Implemented as normalize_melee_mm() below - SQL can't call the
--     TS function directly, so this is a deliberate, commented duplicate;
--     if normalizeMm() ever changes, this must change with it (same
--     duplication pattern already used between lib/melee-pricing.ts and
--     lib/melee-import-shared.mjs for the same reason).
--   - Origin resolution mirrors resolveMeleeOrigin() - strict, never guesses:
--     'natural' -> natural; 'lab'/'lab grown'/'lab-grown' -> lab; anything else
--     (including blank/'none') is flagged, never defaulted.
--   - Graceful degradation: an incomplete/unresolvable/unpriced melee input
--     never blocks metal/labour/stone pricing - melee_retail simply stays 0
--     and a new `melee_status` field in the JSON result explains why
--     (none | ok | incomplete | no_origin | origin_unrecognized | no_price),
--     mirroring the discriminated status the piece melee-price endpoint and
--     quote-builder /api/quotes/melee-price already return.
--   - Composite mode is UNCHANGED - it already explicitly excludes stone AND
--     melee ("Stone costs not included in composite pricing - add manually
--     at quote time"), which is pre-existing, deliberate behaviour unrelated
--     to this fix. Not in scope here.
--   - made_to_order mode: previously, `melee_included = true` on the parent
--     design would trigger the SAME fake placeholder lookup as ready_to_wear.
--     There is no piece row in this mode to fall back to, so unless a future
--     caller passes explicit p_melee_* params, melee_retail is now 0 with
--     melee_status = 'no_origin' - this is a deliberate behaviour change:
--     continuing to fabricate a fixed melee cost with no real data behind it
--     would be the opposite of this fix. No current caller uses made_to_order
--     mode with melee_included=true (the only real caller is ready_to_wear).
-- -----------------------------------------------------------------------------

-- -- PIECE 1 OF 2: normalize_melee_mm -- paste and run this block first --------

-- mm canonicalization (SQL mirror of lib/melee-pricing.ts's normalizeMm)
CREATE OR REPLACE FUNCTION public.normalize_melee_mm(mm text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
BEGIN
  IF mm IS NULL OR btrim(mm) = '' THEN
    RETURN NULL;
  END IF;
  parts := regexp_split_to_array(btrim(mm), '\s*[xX]\s*');
  IF array_length(parts, 1) = 2 THEN
    RETURN ROUND(parts[1]::numeric, 2)::text || ' x ' || ROUND(parts[2]::numeric, 2)::text;
  ELSE
    RETURN ROUND(btrim(mm)::numeric, 2)::text;
  END IF;
EXCEPTION WHEN others THEN
  -- Defensive: non-numeric input is returned trimmed, never throws - matches
  -- normalizeMm()'s fallback behaviour exactly.
  RETURN btrim(mm);
END;
$$;

-- -- PIECE 2 OF 2: calculate_price -- paste and run this block second --------

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
  -- New in 124 - explicit melee inputs (optional; ready_to_wear falls back to
  -- the piece's own real melee_* columns when these are omitted).
  p_melee_origin           text     DEFAULT NULL,
  p_melee_shape            text     DEFAULT NULL,
  p_melee_quality          text     DEFAULT NULL,
  p_melee_carat            numeric  DEFAULT NULL,
  p_melee_mm               text     DEFAULT NULL,
  p_melee_qty              integer  DEFAULT NULL
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
BEGIN

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
    -- UNCHANGED by this migration - stone/melee remain explicitly excluded,
    -- pre-existing behaviour, not in scope for the melee fix.

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

  -- Build metal type key

  v_metal_type_key := CASE
    WHEN v_metal_karat = '9K'       THEN '9ct '   || initcap(COALESCE(v_metal_colour, 'Yellow')) || ' Gold'
    WHEN v_metal_karat = '18K'      THEN '18ct '  || initcap(COALESCE(v_metal_colour, 'Yellow')) || ' Gold'
    WHEN v_metal_karat = 'Platinum' THEN 'Platinum'
    WHEN v_metal_karat = 'Silver'   THEN 'Sterling Silver'
    ELSE v_metal_karat
  END;

  -- Metal price - supplier override takes priority over live rate

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
        'hint',       'Add a price row in Settings -> Pricing -> Metal Prices'
      );
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

  -- Calculate components

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

  -- Melee (124 - real mm-precise, quality-direct pricing)

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
    + COALESCE(p_birthstone_retail, 0);

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
