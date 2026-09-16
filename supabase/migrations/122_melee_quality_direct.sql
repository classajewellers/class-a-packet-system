-- ─────────────────────────────────────────────────────────────────────────────
-- 122: Melee quality selected directly — retire pricing_melee_quality_map
-- from the pricing path
--
-- Confirmed: staff now pick a single combined Quality value (as it exists in
-- pricing_melee_stones, e.g. "EF VVS", "Fancy Yellow SI1-SI2+") instead of
-- separate Colour Group + Clarity dropdowns. pricing_melee_quality_map is no
-- longer read or written anywhere in the quote-builder/piece-detail pricing
-- flow — left in place, unused, same treatment as supplier_id (migration 121).
--
-- Schema choice: ADD melee_quality (nullable text) rather than repurposing
-- melee_colour_group/melee_clarity — those columns may already hold real data
-- on existing pieces, and this project's convention is to never guess/rewrite
-- existing data. Old columns are kept as a read-only legacy fallback: if a
-- piece has no melee_quality but has both legacy fields, the app composes
-- "<colour_group> <clarity>" at read time (the exact, well-established join
-- this app has always used to build a quality string — not a guess, since it
-- reverses a known-safe compose, not an ambiguous split). New/edited pieces
-- write melee_quality directly; legacy fields are never written to again.
--
-- Safe to re-run (IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS melee_quality text;
