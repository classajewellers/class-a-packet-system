-- ─────────────────────────────────────────────────────────────────────────────
-- 105: Melee price list import — extend pricing_melee_stones + seed suppliers
--
-- Extends pricing_melee_stones to hold the full structured data extracted from
-- real supplier price lists (shape, size convention, quality, price per carat,
-- supplier scoping, origin).
--
-- Backwards-compatible: stone_type and price_per_stone columns are kept so the
-- existing /pricing UI and calculate_price() melee lookup continue to work
-- without change. Both are deprecated and will be removed in a later migration
-- once their callers are updated.
--
-- UNIQUE constraint choice: quality is NOT NULL DEFAULT 'unspecified' so it
-- can participate in the UNIQUE constraint without NULL-equality issues.
-- Delete-by-supplier_id (the overwrite step) is the primary dedup mechanism;
-- the UNIQUE constraint catches duplicate rows within a single import batch.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Seed Sapphire Export and Grown Diamonds into inventory_suppliers
--    Uses INSERT ... WHERE NOT EXISTS — safe to re-run; inventory_suppliers
--    has no UNIQUE constraint on name so ON CONFLICT (name) would fail.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO inventory_suppliers (id, tenant_id, name, notes, created_at)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Sapphire Export', 'Natural diamond melee supplier', now()
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_suppliers
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND LOWER(name) = 'sapphire export'
);

INSERT INTO inventory_suppliers (id, tenant_id, name, notes, created_at)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Grown Diamonds', 'Lab-grown diamond melee supplier', now()
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_suppliers
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND LOWER(name) = 'grown diamonds'
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Extend pricing_melee_stones with new columns
-- ─────────────────────────────────────────────────────────────────────────────

-- Supplier scoping — required for per-supplier overwrite
ALTER TABLE pricing_melee_stones
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES inventory_suppliers(id) ON DELETE CASCADE;

-- Origin: 'natural' or 'lab'
ALTER TABLE pricing_melee_stones
  ADD COLUMN IF NOT EXISTS origin text;

-- Shape: 'round', 'oval', 'cushion', 'princess', 'pear', etc.
ALTER TABLE pricing_melee_stones
  ADD COLUMN IF NOT EXISTS shape text;

-- Size convention discriminator: 'carat_range' or 'pieces_per_carat'
ALTER TABLE pricing_melee_stones
  ADD COLUMN IF NOT EXISTS size_type text;

-- Numeric bounds — semantics depend on size_type:
--   carat_range:     size_from = lower carat,  size_to = upper carat
--   pieces_per_carat: size_from = fewer pcs/ct, size_to = more pcs/ct
ALTER TABLE pricing_melee_stones
  ADD COLUMN IF NOT EXISTS size_from numeric(12,6);

ALTER TABLE pricing_melee_stones
  ADD COLUMN IF NOT EXISTS size_to numeric(12,6);

-- Quality grade as stated in the document — NOT NULL, defaults to 'unspecified'
ALTER TABLE pricing_melee_stones
  ADD COLUMN IF NOT EXISTS quality text NOT NULL DEFAULT 'unspecified';

-- Price per carat (AUD) — the unit used by real price lists
ALTER TABLE pricing_melee_stones
  ADD COLUMN IF NOT EXISTS price_per_carat numeric(10,4);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. New UNIQUE constraint scoped to supplier
--
-- Old constraint: (tenant_id, size_label, stone_type) — too loose for
-- per-supplier imports. Replace with one that captures the full row identity.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pricing_melee_stones
  DROP CONSTRAINT IF EXISTS pricing_melee_stones_tenant_size_stone_key;

ALTER TABLE pricing_melee_stones
  ADD CONSTRAINT pricing_melee_stones_supplier_row_key
    UNIQUE (tenant_id, supplier_id, origin, shape, size_type, size_from, size_to, quality);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Index for the per-supplier DELETE used in the overwrite step
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS pricing_melee_stones_supplier_idx
  ON pricing_melee_stones (tenant_id, supplier_id);
