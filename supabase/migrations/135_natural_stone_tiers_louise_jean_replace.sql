-- -----------------------------------------------------------------------------
-- 135: replace natural_stone cost tiers with Louise Jean's actual displayed
--      markup structure
--
-- Full replace, not an edit - the 10 rows seeded in migration 132 were an
-- earlier reverse-engineered estimate; this is the real table read directly
-- off Louise Jean's own displayed pricing, confirmed by Josh. Multipliers are
-- markedly lower than the earlier estimate.
--
-- Several rows intentionally share a multiplier across different cost
-- ranges (500-1000 and 1000-2000 both 1.35; 3000-5000 and 5000-10000 both
-- 1.30; 30000-100000 and 100000+ both 1.25) - this matches the source table
-- exactly and is not simplified/collapsed into fewer rows, since Louise
-- Jean's own boundaries are the point of using their real structure.
--
-- Contiguity confirmed programmatically before writing this file: 11 rows,
-- zero gaps, zero overlaps, open-ended ceiling via cost_max = NULL on the
-- last row (mirrors how the existing lab_stone table's top tier already
-- works - no catch-all above the highest bracket, calculate_price() reports
-- no_price there by design, not a guessed multiplier).
--
-- lab_stone tiers are NOT touched by this migration - natural_stone only.
--
-- Wrapped in a transaction: DELETE then INSERT as one atomic unit, so a
-- failure partway through (e.g. a constraint violation on one of the new
-- rows) rolls back to the untouched old 10 rows rather than leaving
-- natural_stone pricing in a half-replaced state.
-- -----------------------------------------------------------------------------

BEGIN;

DELETE FROM pricing_component_rules
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND component_type = 'natural_stone';

INSERT INTO pricing_component_rules (tenant_id, component_type, carat_min, cost_min, cost_max, multiplier, notes) VALUES
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 0,      300,    1.45, 'Louise Jean actual displayed markup structure, confirmed by Josh 2026-09-18 - replaces the 132 estimate'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 300,    500,    1.40, 'Louise Jean actual displayed markup structure, confirmed by Josh 2026-09-18 - replaces the 132 estimate'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 500,    1000,   1.35, 'Louise Jean actual displayed markup structure, confirmed by Josh 2026-09-18 - replaces the 132 estimate'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 1000,   2000,   1.35, 'Louise Jean actual displayed markup structure, confirmed by Josh 2026-09-18 - replaces the 132 estimate'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 2000,   3000,   1.34, 'Louise Jean actual displayed markup structure, confirmed by Josh 2026-09-18 - replaces the 132 estimate'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 3000,   5000,   1.30, 'Louise Jean actual displayed markup structure, confirmed by Josh 2026-09-18 - replaces the 132 estimate'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 5000,   10000,  1.30, 'Louise Jean actual displayed markup structure, confirmed by Josh 2026-09-18 - replaces the 132 estimate'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 10000,  15000,  1.28, 'Louise Jean actual displayed markup structure, confirmed by Josh 2026-09-18 - replaces the 132 estimate'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 15000,  30000,  1.26, 'Louise Jean actual displayed markup structure, confirmed by Josh 2026-09-18 - replaces the 132 estimate'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 30000,  100000, 1.25, 'Louise Jean actual displayed markup structure, confirmed by Josh 2026-09-18 - replaces the 132 estimate'),
  ('00000000-0000-0000-0000-000000000001', 'natural_stone', 0, 100000, NULL,   1.25, 'Louise Jean actual displayed markup structure, confirmed by Josh 2026-09-18 - replaces the 132 estimate');

COMMIT;
