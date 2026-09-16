-- ─────────────────────────────────────────────────────────────────────────────
-- 121: Melee pricing overhaul — mm-precise rows + drop the supplier concept
--
-- CORRECTED: the first version of this migration assumed pricing_melee_stones
-- already had the columns 095/105/114 add (tenant_id, supplier_id, origin,
-- shape, size_type, size_from, size_to, quality, price_per_carat) and that
-- pricing_melee_quality_map already existed. On staging, NONE of that had
-- landed — pricing_melee_stones was still at its ORIGINAL 016 schema
-- (id, size_label, stone_type, price_per_stone, updated_at), and
-- pricing_melee_quality_map didn't exist at all. (Confirmed by querying
-- staging's live schema directly, not inferred from the migration files.)
-- Corroborating evidence this isn't melee-specific: pricing_metal_rates also
-- lacks tenant_id (migration 097) on staging.
--
-- This version is a SELF-CONTAINED catch-up + the intended 121 changes, so it
-- reaches the correct final state regardless of which of 095/105/114 already
-- ran. Every step is idempotent (IF NOT EXISTS / IF EXISTS / guarded DO
-- blocks) — safe to run whether the target already has none, some, or all of
-- the prerequisite schema (e.g. if production already has 095/105/114 fully
-- applied, those sections simply no-op).
--
-- ── Part A — catch-up: reach the pre-121 schema (095 + 105 + 114) ──────────
-- ── Part B — the actual 121 changes: mm-precise rows, no supplier concept ──
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- PART A1 (from 095) — tenant_id on pricing_melee_stones
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE pricing_melee_stones
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE pricing_melee_stones
  SET tenant_id = '00000000-0000-0000-0000-000000000001'
  WHERE tenant_id IS NULL;

ALTER TABLE pricing_melee_stones
  ALTER COLUMN tenant_id SET NOT NULL;

-- Drop 095's own intermediate constraints — Part B replaces row identity
-- entirely with a supplier-free, mm-aware unique index, so neither the
-- original (size_label, stone_type) key nor 095's (tenant, size_label,
-- stone_type) key is needed going forward.
ALTER TABLE pricing_melee_stones
  DROP CONSTRAINT IF EXISTS pricing_melee_stones_size_label_stone_type_key;
ALTER TABLE pricing_melee_stones
  DROP CONSTRAINT IF EXISTS pricing_melee_stones_tenant_size_stone_key;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART A2 (from 105) — structured columns for real supplier price-list data.
-- NOTE: 105 also seeded two suppliers (Sapphire Export / Grown Diamonds) and
-- added a supplier-scoped UNIQUE constraint + index. Deliberately SKIPPED
-- here — Part B removes the supplier concept entirely, so seeding suppliers
-- or building supplier-scoped constraints/indexes now would be immediately
-- superseded. Only the column additions (needed regardless of supplier model)
-- are replayed.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE pricing_melee_stones ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES inventory_suppliers(id) ON DELETE CASCADE;
ALTER TABLE pricing_melee_stones ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE pricing_melee_stones ADD COLUMN IF NOT EXISTS shape text;
ALTER TABLE pricing_melee_stones ADD COLUMN IF NOT EXISTS size_type text;
ALTER TABLE pricing_melee_stones ADD COLUMN IF NOT EXISTS size_from numeric(12,6);
ALTER TABLE pricing_melee_stones ADD COLUMN IF NOT EXISTS size_to numeric(12,6);
ALTER TABLE pricing_melee_stones ADD COLUMN IF NOT EXISTS quality text NOT NULL DEFAULT 'unspecified';
ALTER TABLE pricing_melee_stones ADD COLUMN IF NOT EXISTS price_per_carat numeric(10,4);

-- Also drop 105's supplier-scoped constraint/index in case a prior partial
-- run (e.g. production, if it has 105 applied) already created them — Part B
-- replaces both.
ALTER TABLE pricing_melee_stones DROP CONSTRAINT IF EXISTS pricing_melee_stones_supplier_row_key;
DROP INDEX IF EXISTS pricing_melee_stones_supplier_idx;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART A3 (from 114) — melee_shape on pieces + the quality-map table.
-- Created here WITH supplier_id NOT NULL (matching 114's original shape) only
-- because Part B immediately relaxes it — this keeps the catch-up a faithful
-- replay of history for anything that inspects it mid-migration.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS melee_shape text;

CREATE TABLE IF NOT EXISTS pricing_melee_quality_map (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id  uuid        REFERENCES inventory_suppliers(id) ON DELETE CASCADE,
  colour_group text        NOT NULL,
  clarity      text        NOT NULL,
  quality      text        NOT NULL,
  confirmed_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pricing_melee_quality_map DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS pricing_melee_quality_map_lookup_idx;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART B — the actual 121 changes (unchanged from the original proposal)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. mm on the price table. TEXT, not numeric: the source lists a single value
--    for round melee ("0.90") but length×width for fancy shapes ("2.50 x 2.50",
--    "4.25 x 3.20"). mm is an exact-match key, never used arithmetically in
--    pricing, so text is lossless and correct. Legacy rows keep mm = NULL.
ALTER TABLE pricing_melee_stones
  ADD COLUMN IF NOT EXISTS mm text;

-- 2. Row identity: no supplier_id, includes mm. A table UNIQUE constraint
--    can't use an expression, so use a unique INDEX with COALESCE(mm, '') so
--    NULL-mm legacy rows still dedupe deterministically.
DROP INDEX IF EXISTS pricing_melee_stones_row_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS pricing_melee_stones_row_key_idx
  ON pricing_melee_stones
     (tenant_id, origin, shape, size_type, size_from, size_to, quality, COALESCE(mm, ''));

-- 3. Quality map: drop any supplier-scoped uniqueness (114's inline UNIQUE, if
--    present), re-key on (tenant, colour, clarity). Discover the constraint by
--    name rather than assuming it, since it's an auto-named inline UNIQUE.
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'pricing_melee_quality_map'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE pricing_melee_quality_map DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- supplier_id was NOT NULL on 114's original shape; ensure it's nullable
-- regardless of whether Part A3 just created it (nullable) or a prior full
-- 114 run created it NOT NULL.
ALTER TABLE pricing_melee_quality_map ALTER COLUMN supplier_id DROP NOT NULL;

DROP INDEX IF EXISTS pricing_melee_quality_map_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS pricing_melee_quality_map_key_idx
  ON pricing_melee_quality_map (tenant_id, colour_group, clarity);

-- 4. Pieces store mm alongside carat (text, matching the price table's mm).
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS melee_mm text;

-- NOTE: supplier_id columns on both tables are intentionally LEFT IN PLACE
-- (nullable, unused). No destructive drop; the pricing path simply stops
-- reading/writing them. calculate_price() is unaffected — it keys on
-- (tenant_id, size_label, stone_type), never on supplier_id.
--
-- KNOWN SEPARATE ISSUE (not fixed here, out of scope): pricing_metal_rates
-- and presumably other pricing-engine tables also lack tenant_id on staging
-- (migration 097 never landed there either). This migration does not touch
-- pricing_metal_rates — flagging for a separate staging/prod drift audit.
