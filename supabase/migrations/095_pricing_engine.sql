-- 095_pricing_engine.sql
--
-- Vault Pricing Engine — Phase 0 / September launch
--
-- What this migration does:
--   1. Adds tenant_id to pricing_gold_prices (deduplicates first, then adds unique constraint)
--   2. Adds tenant_id to pricing_melee_stones
--   3. Adds recipe columns to inventory_products (labour_cost, setting_cost, melee_included)
--   4. Creates design_band_recipes — gram weight per band width per design
--   5. Creates inventory_product_variants — Layer 2 of the product model
--   6. Creates pricing_component_rules — configurable multipliers per component type
--   7. Creates price_calculation_snapshots — accepted quote price locks
--   8. Creates calculate_price() — the one live pricing function
--
-- Engineering rules enforced:
--   - Every new table: ENABLE ROW LEVEL SECURITY
--   - Every table: tenant_id from day one
--   - calculate_price() never calls external APIs — pure SQL calculation
--   - All multipliers live in pricing_component_rules, never hardcoded in the function
--
-- Open decisions (multiplier seeds are provisional — require Brad/Josh sign-off):
--   - Metal multiplier: 1.40
--   - Labour multiplier: 1.80
--   - Melee multiplier: 3.50
--   - Natural stone tiers: <1ct = 2.5x, 1-2ct = 2x, >2ct = 1.25x
--   - Lab stone: flat 11x
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pricing_gold_prices — add tenant_id
--
-- Current state: no tenant_id, no unique constraint on metal_type, price_per_gram nullable.
-- Goal: UNIQUE(tenant_id, metal_type), tenant_id NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────────

-- Deduplicate: keep only the most recent row per metal_type before constraining.
-- (The seed in 048 used ON CONFLICT DO NOTHING against the PK — which never conflicts
-- with a uuid PK — so multiple rows per metal_type may exist in production.)
DELETE FROM pricing_gold_prices
WHERE id NOT IN (
  SELECT DISTINCT ON (metal_type) id
  FROM pricing_gold_prices
  ORDER BY metal_type, effective_date DESC, created_at DESC
);

-- Add tenant_id nullable first so we can backfill
ALTER TABLE pricing_gold_prices ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Backfill existing rows to Class A
UPDATE pricing_gold_prices SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- Now make NOT NULL
ALTER TABLE pricing_gold_prices ALTER COLUMN tenant_id SET NOT NULL;

-- Add unique constraint
ALTER TABLE pricing_gold_prices DROP CONSTRAINT IF EXISTS pricing_gold_prices_tenant_metal_key;
ALTER TABLE pricing_gold_prices ADD CONSTRAINT pricing_gold_prices_tenant_metal_key UNIQUE (tenant_id, metal_type);

CREATE INDEX IF NOT EXISTS pricing_gold_prices_tenant_idx ON pricing_gold_prices (tenant_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. pricing_melee_stones — add tenant_id
--
-- Current state: UNIQUE(size_label, stone_type), no tenant_id.
-- Goal: UNIQUE(tenant_id, size_label, stone_type).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pricing_melee_stones ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Backfill existing rows to Class A
UPDATE pricing_melee_stones SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

ALTER TABLE pricing_melee_stones ALTER COLUMN tenant_id SET NOT NULL;

-- Replace the old global unique constraint with a tenant-scoped one
ALTER TABLE pricing_melee_stones DROP CONSTRAINT IF EXISTS pricing_melee_stones_size_label_stone_type_key;
ALTER TABLE pricing_melee_stones DROP CONSTRAINT IF EXISTS pricing_melee_stones_tenant_size_stone_key;
ALTER TABLE pricing_melee_stones ADD CONSTRAINT pricing_melee_stones_tenant_size_stone_key UNIQUE (tenant_id, size_label, stone_type);

CREATE INDEX IF NOT EXISTS pricing_melee_stones_tenant_idx ON pricing_melee_stones (tenant_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. inventory_products — add recipe columns (Layer 1 design template)
-- ─────────────────────────────────────────────────────────────────────────────

-- Base labour cost (wholesale, before markup) — e.g. casting + polishing + QC
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS labour_cost numeric(10,2);

-- Base setting cost (wholesale, before markup) — e.g. claw setting, bezel setting
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS setting_cost numeric(10,2);

-- Whether this design includes a standard diamond melee band
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS melee_included boolean NOT NULL DEFAULT false;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. design_band_recipes — gram weight per band width per design
--
-- One row per (design_id, band_width_mm, metal_karat) combination.
-- Ben supplies these from CAD data.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS design_band_recipes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  design_id    uuid        NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  band_width_mm numeric(4,2) NOT NULL,  -- e.g. 1.80, 2.00, 2.50, 3.00
  metal_karat  text        NOT NULL,    -- '9K' | '18K' | 'Platinum' | 'Silver'
  gram_weight  numeric(8,3) NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, band_width_mm, metal_karat)
);

ALTER TABLE design_band_recipes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS design_band_recipes_design_idx ON design_band_recipes (design_id);
CREATE INDEX IF NOT EXISTS design_band_recipes_tenant_idx ON design_band_recipes (tenant_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. inventory_product_variants — Layer 2 of the product model
--
-- A variant is a sellable configuration of a design: metal, band width, claw config.
-- Links to Shopify variants for made-to-order designs.
-- Pricing is never stored here — always live-calculated via calculate_price().
--
-- Note: the legacy inventory_variants table (migration 026) remains in place but
-- is not extended — it references the old thin inventory_products schema and has
-- no tenant_id. New code should use this table instead.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_product_variants (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  design_id         uuid        NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  name              text,       -- human-readable, e.g. "18ct Yellow Gold 2mm"
  metal_karat       text        NOT NULL,  -- '9K' | '18K' | 'Platinum' | 'Silver'
  metal_colour      text        NOT NULL,  -- 'Yellow' | 'White' | 'Rose' | 'N/A'
  band_width_mm     numeric(4,2),
  claw_config       text,       -- aesthetic only — zero pricing impact
  shopify_variant_id text,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, metal_karat, metal_colour, band_width_mm)
);

ALTER TABLE inventory_product_variants ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS inv_product_variants_design_idx  ON inventory_product_variants (design_id);
CREATE INDEX IF NOT EXISTS inv_product_variants_tenant_idx  ON inventory_product_variants (tenant_id);
CREATE INDEX IF NOT EXISTS inv_product_variants_shopify_idx ON inventory_product_variants (shopify_variant_id) WHERE shopify_variant_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. pricing_component_rules — configurable multipliers per component type
--
-- component_type values:
--   'metal'         — applied to (gram_weight × gold_price_per_gram)
--   'labour'        — applied to (labour_cost + setting_cost)
--   'natural_stone' — applied to stone_wholesale_cost; tiered by carat range
--   'lab_stone'     — applied to stone_wholesale_cost; flat regardless of carat
--   'melee'         — applied to melee_wholesale_cost
--   'birthstone'    — N/A (passed through at list price, no markup applied here)
--
-- For stone tiers: carat_min is inclusive, carat_max is exclusive, NULL = no upper bound.
-- For non-stone components: carat_min = 0, carat_max = NULL.
-- UNIQUE(tenant_id, component_type, carat_min) ensures one rule per tier.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pricing_component_rules (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid         NOT NULL,
  component_type text         NOT NULL,
  carat_min      numeric(8,3) NOT NULL DEFAULT 0,  -- 0 for non-stone components
  carat_max      numeric(8,3),                      -- NULL = no upper bound
  multiplier     numeric(6,4) NOT NULL,
  notes          text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, component_type, carat_min)
);

ALTER TABLE pricing_component_rules ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS pricing_component_rules_tenant_type_idx
  ON pricing_component_rules (tenant_id, component_type);

-- Seed defaults for Class A
-- ⚠ These multipliers are provisional — require Brad/Josh sign-off before launch.
-- They are configurable and can be updated in the Pricing Hub without a migration.
INSERT INTO pricing_component_rules (tenant_id, component_type, carat_min, carat_max, multiplier, notes) VALUES
  -- Metal: lower markup — customers can verify spot gold price independently
  ('00000000-0000-0000-0000-000000000001', 'metal',         0,    NULL,  1.40, 'PROVISIONAL — awaiting Brad sign-off'),
  -- Labour & setting: standard fixed markup
  ('00000000-0000-0000-0000-000000000001', 'labour',        0,    NULL,  1.80, 'PROVISIONAL — awaiting Brad sign-off'),
  -- Natural stone: tiered by carat weight (Brad to confirm breakpoints)
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0,    1.00,  2.50, '<1ct natural — PROVISIONAL'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 1.00, 2.00,  2.00, '1-2ct natural — PROVISIONAL'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 2.00, NULL,  1.25, '>2ct natural — PROVISIONAL'),
  -- Lab stone: flat 11x regardless of carat/colour/clarity/shape incl. IF
  -- Confirmed across 8 real competitor comparison stones (Cullen, Louise Jean, TMC)
  ('00000000-0000-0000-0000-000000000001', 'lab_stone',     0,    NULL, 11.00, 'Confirmed 11x flat — 8 competitor comparison stones'),
  -- Melee: highest margin tier
  ('00000000-0000-0000-0000-000000000001', 'melee',         0,    NULL,  3.50, 'PROVISIONAL — awaiting Brad sign-off')
ON CONFLICT (tenant_id, component_type, carat_min) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. price_calculation_snapshots — accepted quote price locks
--
-- Created when a customer accepts a quote. Freezes the calculation inputs and
-- output for the quote's validity window (typically 7 days).
-- This is the ONLY place a calculated price is ever stored — never elsewhere.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_calculation_snapshots (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid         NOT NULL,
  quote_id            uuid         REFERENCES quotes(id) ON DELETE CASCADE,
  piece_id            uuid         REFERENCES inventory_pieces(id) ON DELETE SET NULL,
  design_id           uuid         REFERENCES inventory_products(id) ON DELETE SET NULL,
  calculation_mode    text         NOT NULL,  -- 'made_to_order' | 'ready_to_wear'
  inputs              jsonb        NOT NULL,  -- full inputs passed to calculate_price()
  breakdown           jsonb        NOT NULL,  -- full JSONB output from calculate_price()
  total_retail        numeric(10,2) NOT NULL,
  gold_price_used     numeric(10,4),
  stone_wholesale_used numeric(10,4),
  valid_until         timestamptz,
  calculated_at       timestamptz  NOT NULL DEFAULT now(),
  locked_at           timestamptz
);

ALTER TABLE price_calculation_snapshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS price_snapshots_quote_idx  ON price_calculation_snapshots (quote_id);
CREATE INDEX IF NOT EXISTS price_snapshots_tenant_idx ON price_calculation_snapshots (tenant_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. calculate_price() — the one live pricing function
--
-- Every price shown anywhere in Vault calls this function.
-- It never calls Nivoda or any external API.
-- The application layer resolves stone wholesale cost from Nivoda before calling.
-- Gold price is read directly from pricing_gold_prices (synced on Vault's cadence).
--
-- Two modes (determined by which parameters are passed):
--   Made-to-order: p_design_id + p_band_width_mm (gram weight from design_band_recipes)
--   Ready-to-wear: p_piece_id              (gram weight from inventory_pieces row)
--
-- Returns JSONB with full cost breakdown + inputs used.
-- Returns { "error": "...", ... } on any validation failure instead of raising.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_price(
  p_tenant_id             uuid,
  -- Made-to-order inputs (pass all three for this mode)
  p_design_id             uuid     DEFAULT NULL,
  p_band_width_mm         numeric  DEFAULT NULL,
  p_metal_karat           text     DEFAULT NULL,   -- '9K' | '18K' | 'Platinum' | 'Silver'
  p_metal_colour          text     DEFAULT NULL,   -- 'Yellow' | 'White' | 'Rose' | 'N/A'
  -- Ready-to-wear input (pass this for that mode)
  p_piece_id              uuid     DEFAULT NULL,
  -- Stone inputs — both modes (resolved by app from Nivoda before calling)
  p_stone_wholesale       numeric  DEFAULT NULL,   -- wholesale cost in AUD
  p_stone_carat           numeric  DEFAULT NULL,
  p_stone_origin          text     DEFAULT NULL,   -- 'natural' | 'lab'
  -- Melee
  p_include_melee         boolean  DEFAULT false,
  -- Extras (passed through, no further markup applied)
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

  -- ── Resolve mode and load spec ─────────────────────────────────────────────

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
      RETURN jsonb_build_object(
        'error', 'piece_not_found',
        'piece_id', p_piece_id
      );
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
      RETURN jsonb_build_object(
        'error', 'design_not_found',
        'design_id', p_design_id
      );
    END IF;

    v_metal_karat  := p_metal_karat;
    v_metal_colour := COALESCE(p_metal_colour, 'Yellow');

    -- Exact band width match first, then closest available
    SELECT gram_weight INTO v_gram_weight
    FROM design_band_recipes
    WHERE design_id = p_design_id
      AND metal_karat = p_metal_karat
      AND band_width_mm = p_band_width_mm
    LIMIT 1;

    IF v_gram_weight IS NULL THEN
      SELECT gram_weight INTO v_gram_weight
      FROM design_band_recipes
      WHERE design_id = p_design_id
        AND metal_karat = p_metal_karat
      ORDER BY ABS(band_width_mm - p_band_width_mm)
      LIMIT 1;
    END IF;

    IF v_gram_weight IS NULL THEN
      RETURN jsonb_build_object(
        'error', 'no_recipe_found',
        'design_id',    p_design_id,
        'band_width_mm', p_band_width_mm,
        'metal_karat',  p_metal_karat
      );
    END IF;

  ELSE
    RETURN jsonb_build_object(
      'error', 'invalid_mode',
      'hint', 'Pass p_piece_id for ready-to-wear, or p_design_id + p_band_width_mm + p_metal_karat for made-to-order'
    );
  END IF;

  -- ── Metal type key ─────────────────────────────────────────────────────────
  -- inventory_pieces stores '9K'/'18K' + 'Yellow'/'White'/'Rose'
  -- pricing_gold_prices stores '9ct Yellow' / '18ct White' / 'Platinum' etc.
  v_metal_type_key := CASE
    WHEN v_metal_karat = '9K'       THEN '9ct '  || COALESCE(v_metal_colour, 'Yellow')
    WHEN v_metal_karat = '18K'      THEN '18ct ' || COALESCE(v_metal_colour, 'Yellow')
    WHEN v_metal_karat = 'Platinum' THEN 'Platinum'
    WHEN v_metal_karat = 'Silver'   THEN 'Silver'
    ELSE v_metal_karat  -- pass through any future karat types
  END;

  -- ── Gold price ─────────────────────────────────────────────────────────────
  -- Try tenant-scoped first, then fall back to unscoped (for rows predating tenant_id).
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
  v_metal_cost   := COALESCE(v_gram_weight, 0) * v_gold_price;
  v_metal_retail := v_metal_cost * v_metal_mult;
  v_labour_retail := (v_labour_cost + v_setting_cost) * v_labour_mult;

  -- Centre stone
  IF p_stone_wholesale IS NOT NULL AND p_stone_wholesale > 0 THEN
    IF LOWER(COALESCE(p_stone_origin, 'natural')) = 'lab' THEN
      SELECT multiplier INTO v_stone_mult
      FROM pricing_component_rules
      WHERE tenant_id = p_tenant_id AND component_type = 'lab_stone'
      LIMIT 1;
      v_stone_mult := COALESCE(v_stone_mult, 11.0);
    ELSE  -- natural (default)
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

  -- Melee (uses design flag or explicit override)
  IF p_include_melee OR v_melee_included THEN
    -- Standard config: 20 × 0.01ct lab-grown rounds (size M flat rate)
    SELECT price_per_stone * 20 INTO v_melee_unit_cost
    FROM pricing_melee_stones
    WHERE tenant_id = p_tenant_id
      AND size_label = '0.01ct'
      AND LOWER(stone_type) LIKE '%lab%'
    LIMIT 1;

    IF v_melee_unit_cost IS NULL THEN
      -- Fallback: any 0.01ct entry (may be natural or unspecified)
      SELECT price_per_stone * 20 INTO v_melee_unit_cost
      FROM pricing_melee_stones
      WHERE tenant_id = p_tenant_id AND size_label = '0.01ct'
      ORDER BY updated_at DESC
      LIMIT 1;
    END IF;

    v_melee_retail := COALESCE(v_melee_unit_cost, 0) * v_melee_mult;
  END IF;

  -- ── Total ──────────────────────────────────────────────────────────────────
  v_total_retail :=
    v_metal_retail
    + v_labour_retail
    + v_stone_retail
    + v_melee_retail
    + COALESCE(p_personalisation_retail, 0)
    + COALESCE(p_birthstone_retail, 0);

  -- ── Return ─────────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'mode',                  v_mode,
    'total_retail',          ROUND(v_total_retail, 2),
    'metal_retail',          ROUND(v_metal_retail, 2),
    'labour_retail',         ROUND(v_labour_retail, 2),
    'stone_retail',          ROUND(v_stone_retail, 2),
    'melee_retail',          ROUND(v_melee_retail, 2),
    'personalisation_retail', ROUND(COALESCE(p_personalisation_retail, 0), 2),
    'birthstone_retail',     ROUND(COALESCE(p_birthstone_retail, 0), 2),
    'inputs', jsonb_build_object(
      'gold_price_per_gram',  v_gold_price,
      'gram_weight',          v_gram_weight,
      'metal_type_key',       v_metal_type_key,
      'metal_multiplier',     v_metal_mult,
      'labour_multiplier',    v_labour_mult,
      'stone_wholesale',      p_stone_wholesale,
      'stone_carat',          p_stone_carat,
      'stone_origin',         p_stone_origin,
      'stone_multiplier',     v_stone_mult,
      'melee_multiplier',     v_melee_mult
    )
  );

END;
$$;
