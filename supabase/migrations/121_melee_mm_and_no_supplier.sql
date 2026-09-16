-- ─────────────────────────────────────────────────────────────────────────────
-- 121: Melee pricing overhaul — mm-precise rows + drop the supplier concept
--
-- Two confirmed changes to how melee is priced:
--
--  1. mm matters. A single nominal carat (e.g. 0.01ct) covers several sellable
--     stones at different mm diameters with DIFFERENT prices (Prana: 0.01ct DE/VS
--     is $375 at 0.90mm but $170 at 1.30mm). Pricing must key on carat AND mm, so
--     every mm variant is its own row. We add an explicit `mm` column rather than
--     overloading size_type — carat stays in size_from/size_to (carat_range), mm
--     is an additional exact-match dimension. Legacy rows keep mm = NULL.
--
--  2. No supplier concept. Melee pricing is now a pure price-fetch by spec
--     (origin/shape/carat/mm/colour/clarity), unrelated to who Class A buys from.
--     supplier_id is left in place but unused/null — no destructive drop. The
--     row identity and the quality-map are re-keyed WITHOUT supplier_id.
--
-- Pieces also gain melee_mm so the per-piece endpoint can match exactly, the
-- same way the quote builder does.
--
-- Safe to re-run (IF EXISTS / IF NOT EXISTS throughout).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. mm on the price table. TEXT, not numeric: the source lists a single value
--    for round melee ("0.90") but length×width for fancy shapes ("2.50 x 2.50",
--    "4.25 x 3.20"). mm is an exact-match key, never used arithmetically in
--    pricing, so text is lossless and correct. Legacy rows keep mm = NULL.
ALTER TABLE pricing_melee_stones
  ADD COLUMN IF NOT EXISTS mm text;

-- 2. Row identity no longer includes supplier_id; it now includes mm.
--    A table UNIQUE constraint can't use an expression, so use a unique INDEX
--    with COALESCE(mm, '') so NULL-mm legacy rows still dedupe deterministically.
ALTER TABLE pricing_melee_stones
  DROP CONSTRAINT IF EXISTS pricing_melee_stones_supplier_row_key;

DROP INDEX IF EXISTS pricing_melee_stones_row_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS pricing_melee_stones_row_key_idx
  ON pricing_melee_stones
     (tenant_id, origin, shape, size_type, size_from, size_to, quality, COALESCE(mm, ''));

-- 3. Quality map: drop the supplier-scoped uniqueness, re-key on (tenant, colour, clarity).
--    The old UNIQUE was an inline (auto-named) constraint — drop by discovery so we
--    don't depend on the generated name.
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

-- supplier_id was NOT NULL on the quality map (114); the map is now supplier-free.
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
