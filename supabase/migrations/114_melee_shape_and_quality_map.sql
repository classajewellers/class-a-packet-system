-- 114_melee_shape_and_quality_map.sql
--
-- Two additions so a piece's set melee stones can be priced from
-- pricing_melee_stones with a CONFIRMED, exact match (never an inferred one):
--
-- 1. inventory_pieces.melee_shape — the shape of the set melee stones. This
--    column genuinely did not exist (052 added only quantity/carat/colour/
--    clarity); shape is needed to match pricing_melee_stones.shape.
--
-- 2. pricing_melee_quality_map — a human-confirmed correspondence from a
--    piece's (colour_group, clarity) to the exact `quality` string used in a
--    supplier's imported price list. The colour/clarity conventions differ
--    across suppliers' lists (e.g. "DEF/VS" vs "F/G/H VS2/SI1"), so this is
--    NEVER auto-derived by a transformation rule — a person confirms each
--    combination, and an unmapped combination is flagged, not guessed.
--    Keyed per supplier because each supplier's price list writes `quality`
--    in its own convention.

ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS melee_shape text;

CREATE TABLE IF NOT EXISTS pricing_melee_quality_map (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id  uuid        NOT NULL REFERENCES inventory_suppliers(id) ON DELETE CASCADE,
  colour_group text        NOT NULL,   -- as stored on the piece, e.g. "D-F"
  clarity      text        NOT NULL,   -- as stored on the piece, e.g. "VS"
  quality      text        NOT NULL,   -- the EXACT quality string in pricing_melee_stones
  confirmed_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_id, colour_group, clarity)
);
ALTER TABLE pricing_melee_quality_map DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS pricing_melee_quality_map_lookup_idx
  ON pricing_melee_quality_map (tenant_id, supplier_id, colour_group, clarity);
