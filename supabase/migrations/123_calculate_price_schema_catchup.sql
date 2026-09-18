-- ─────────────────────────────────────────────────────────────────────────────
-- 123: calculate_price() schema catch-up — same class of drift as migration 121
--
-- calculate_price() (current definition: 104_composite_pricing.sql) cannot run
-- at all on staging today — confirmed by querying staging's live schema
-- directly (not inferred from migration files):
--   • pricing_component_rules  — MISSING entirely (should exist since 095)
--   • design_band_recipes      — MISSING entirely (should exist since 095)
--   • design_components        — MISSING entirely (should exist since 104)
--   • inventory_suppliers.gold_rate_override_per_gram — MISSING (should exist since 099)
--   • inventory_pieces.product_id — MISSING, and NOT explained by any missed
--     migration: no migration file in this repo ever does
--     `ALTER TABLE inventory_pieces ADD COLUMN product_id` — 079's own comment
--     says the column "exists (nullable uuid, no FK yet)" at that point,
--     meaning it was added outside the tracked migration history entirely
--     (a manual/dashboard change on whichever environment 079 was written
--     against). This migration adds it directly since no historical replay
--     will ever produce it.
--
-- ⚠️ PRODUCTION STATUS UNKNOWN. I have no production database access — Josh
-- needs to either check production's schema directly (the same queries used
-- to find this on staging: fetch the PostgREST OpenAPI doc, or `\d` each
-- table in the SQL editor) or grant equivalent access. This migration is
-- written to be idempotent either way — IF NOT EXISTS / ON CONFLICT DO
-- NOTHING throughout — so it is SAFE TO RUN on production regardless of
-- whether production already has all, some, or none of this schema. If
-- production already has it all, every statement below no-ops.
--
-- TODO(pricing-signoff): Multiplier seed values below (pricing_component_rules)
-- are STILL PROVISIONAL. Confirmed with Josh (2026-09-16): proceed with these
-- figures now so Phase 0 isn't blocked, but they are NOT final — the same
-- numbers migration 095 seeded, marked 'PROVISIONAL — awaiting sign-off' back
-- then, and never confirmed by Brad since (per docs/vault-pricing-notes.md's
-- own "Open decisions requiring sign-off" list — this predates this migration
-- by months and must not be allowed to quietly become permanent because it
-- works). Grep this repo for "TODO(pricing-signoff)" to find every place this
-- still needs resolving before the quote-builder migration (calculate_price
-- rebuild, Phase 1+) is considered done. ON CONFLICT DO NOTHING below means
-- this migration will NEVER overwrite a value already present (e.g. if
-- production has already been given real confirmed multipliers since 095).
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. inventory_pieces.product_id — untracked drift, added directly (see note above)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS product_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_pieces_product_id_fkey'
  ) THEN
    ALTER TABLE inventory_pieces
      ADD CONSTRAINT inventory_pieces_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inventory_pieces_product_id_idx
  ON inventory_pieces (product_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. inventory_suppliers.gold_rate_override_per_gram (from 099)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE inventory_suppliers
  ADD COLUMN IF NOT EXISTS gold_rate_override_per_gram numeric(10,4);

-- inventory_products.pricing_method / supplier_id (from 099) — already present
-- on staging; included for any environment (e.g. production) where they aren't.
ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS pricing_method text NOT NULL DEFAULT 'class_a_standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_products_pricing_method_check'
  ) THEN
    ALTER TABLE inventory_products
      ADD CONSTRAINT inventory_products_pricing_method_check
        CHECK (pricing_method IN ('class_a_standard', 'supplier_method'));
  END IF;
END $$;

ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES inventory_suppliers(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. pricing_component_rules (from 095) — the per-component multiplier table
--    calculate_price() reads for metal/labour/lab_stone/natural_stone/melee.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pricing_component_rules (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid         NOT NULL,
  component_type text         NOT NULL,
  carat_min      numeric(8,3) NOT NULL DEFAULT 0,
  carat_max      numeric(8,3),
  multiplier     numeric(6,4) NOT NULL,
  notes          text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, component_type, carat_min)
);
ALTER TABLE pricing_component_rules ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS pricing_component_rules_tenant_type_idx
  ON pricing_component_rules (tenant_id, component_type);

-- Seed — PROVISIONAL values from 095/098, never confirmed since (see note
-- above). ON CONFLICT DO NOTHING: never overwrites a value already present.
-- The TODO(pricing-signoff) tag is stored IN the notes column deliberately —
-- anyone viewing this table directly (Settings → Pricing, a future dev query)
-- sees the unconfirmed status live in the data, not just in this file.
INSERT INTO pricing_component_rules (tenant_id, component_type, carat_min, carat_max, multiplier, notes) VALUES
  ('00000000-0000-0000-0000-000000000001', 'metal',         0,     NULL,  1.40, 'TODO(pricing-signoff): PROVISIONAL — awaiting Brad sign-off (unconfirmed since 095)'),
  ('00000000-0000-0000-0000-000000000001', 'labour',        0,     NULL,  1.80, 'TODO(pricing-signoff): PROVISIONAL — awaiting Brad sign-off (unconfirmed since 095)'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0,     1.00,  2.50, 'TODO(pricing-signoff): <1ct natural — PROVISIONAL (unconfirmed since 095)'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 1.00,  2.00,  2.00, 'TODO(pricing-signoff): 1-2ct natural — PROVISIONAL (unconfirmed since 095)'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 2.00,  NULL,  1.25, 'TODO(pricing-signoff): >2ct natural — PROVISIONAL (unconfirmed since 095)'),
  ('00000000-0000-0000-0000-000000000001', 'melee',         0,     NULL,  3.50, 'TODO(pricing-signoff): PROVISIONAL — awaiting Brad sign-off (unconfirmed since 095)')
ON CONFLICT (tenant_id, component_type, carat_min) DO NOTHING;

-- lab_stone tiers — the 098 replacement (evidence-based, unlike the flat
-- provisional figures above, but 098's own notes flag it as incomplete above
-- 8.61ct and conservative for E/F colour — see 098's NOTE A/B/C). Tagged
-- TODO(pricing-signoff) too since "evidence-based but incomplete" is still an
-- open item, not a closed one. Also ON CONFLICT DO NOTHING.
INSERT INTO pricing_component_rules (tenant_id, component_type, carat_min, carat_max, multiplier, notes) VALUES
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 0.000, 2.000, 10.5000, 'TODO(pricing-signoff): ≤2ct lab — D/VVS1 2ct=10.50×; confirmed E/VVS1=10.53×, F/VS1=10.55× (Aug-2026 benchmarking)'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 2.000, 3.000,  8.5000, 'TODO(pricing-signoff): >2–3ct lab — D/VVS1 3ct=8.47× (Aug-2026 benchmarking); single colour grade'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 3.000, 4.000,  7.0000, 'TODO(pricing-signoff): >3–4ct lab — D/VVS1 4ct=6.95× (Aug-2026 benchmarking); D-anchored conservative for E/F — see 098 NOTE A'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 4.000, 5.000,  5.5000, 'TODO(pricing-signoff): >4–5ct lab — D/VVS1 5ct=5.46× (Aug-2026 benchmarking); single colour grade'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 5.000, 6.000,  4.9000, 'TODO(pricing-signoff): >5–6ct lab — D/VVS1 6ct=4.91× (Aug-2026 benchmarking); D-anchored conservative for E/F — see 098 NOTE A'),
  ('00000000-0000-0000-0000-000000000001', 'lab_stone', 6.000, NULL,   3.8500, 'TODO(pricing-signoff): >6ct lab plateau — confirmed to 8.61ct (3.85×), no data above — see 098 NOTE C')
ON CONFLICT (tenant_id, component_type, carat_min) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. design_band_recipes (095, plus 102's dimension_type/value generalization
--    and 103's band_width_mm-nullable relaxation, replayed in final form)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS design_band_recipes (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid          NOT NULL,
  design_id      uuid          NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  band_width_mm  numeric(4,2),                 -- nullable since 103
  metal_karat    text          NOT NULL,
  gram_weight    numeric(8,3)  NOT NULL,
  notes          text,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  dimension_type  text,
  dimension_value numeric(10,4)
);

-- Backfill dimension_type/value for any pre-102 rows (safe no-op if none exist).
UPDATE design_band_recipes
SET dimension_type = 'band_width_mm', dimension_value = band_width_mm
WHERE dimension_type IS NULL AND band_width_mm IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM design_band_recipes WHERE dimension_type IS NULL) THEN
    ALTER TABLE design_band_recipes ALTER COLUMN dimension_type SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM design_band_recipes WHERE dimension_value IS NULL) THEN
    ALTER TABLE design_band_recipes ALTER COLUMN dimension_value SET NOT NULL;
  END IF;
END $$;

ALTER TABLE design_band_recipes
  DROP CONSTRAINT IF EXISTS design_band_recipes_design_id_band_width_mm_metal_karat_key;
ALTER TABLE design_band_recipes
  DROP CONSTRAINT IF EXISTS design_band_recipes_dim_karat_unique;
ALTER TABLE design_band_recipes
  ADD CONSTRAINT design_band_recipes_dim_karat_unique
    UNIQUE (design_id, dimension_type, dimension_value, metal_karat);

ALTER TABLE design_band_recipes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS design_band_recipes_design_idx ON design_band_recipes (design_id);
CREATE INDEX IF NOT EXISTS design_band_recipes_tenant_idx ON design_band_recipes (tenant_id);
CREATE INDEX IF NOT EXISTS design_band_recipes_dim_type_idx
  ON design_band_recipes (design_id, dimension_type, metal_karat);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. design_components (104 — composite-mode sub-assemblies)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS design_components (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid          NOT NULL,
  parent_design_id     uuid          NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  component_design_id  uuid          NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  dimension_type       text          NOT NULL,
  dimension_value      numeric(10,4) NOT NULL,
  metal_karat          text          NOT NULL,
  metal_colour         text          NOT NULL DEFAULT 'Yellow',
  sort_order           integer       NOT NULL DEFAULT 0,
  notes                text,
  created_at           timestamptz   NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'design_components_parent_design_id_check'
  ) THEN
    ALTER TABLE design_components
      ADD CONSTRAINT design_components_parent_design_id_check
        CHECK (parent_design_id != component_design_id);
  END IF;
END $$;

ALTER TABLE design_components
  DROP CONSTRAINT IF EXISTS design_components_parent_design_id_component_design_id_key;
ALTER TABLE design_components
  ADD CONSTRAINT design_components_parent_design_id_component_design_id_key
    UNIQUE (parent_design_id, component_design_id);

-- Matches 104's original choice exactly (unlike every other pricing table in
-- this migration, which is RLS-enabled) — flagging the inconsistency rather
-- than silently "fixing" it; not this migration's call to make.
ALTER TABLE design_components DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS design_components_parent_idx
  ON design_components (tenant_id, parent_design_id);
CREATE INDEX IF NOT EXISTS design_components_component_idx
  ON design_components (tenant_id, component_design_id);
