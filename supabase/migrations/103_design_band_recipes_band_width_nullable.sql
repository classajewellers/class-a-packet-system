-- 103: Allow band_width_mm to be NULL on design_band_recipes
--
-- Migration 102 added dimension_type + dimension_value but left band_width_mm
-- as NOT NULL (inherited from migration 095's CREATE TABLE). Inserting a new
-- non-ring recipe (e.g. chain_length_cm) fails because band_width_mm has no
-- meaningful value outside of ring dimensions.
--
-- Existing ring rows keep their real band_width_mm values (backfilled by 102).
-- New rows for any other dimension_type insert with band_width_mm = NULL.
-- No TypeScript caller reads design_band_recipes.band_width_mm — all live
-- references to that column name are on inventory_product_variants.

ALTER TABLE design_band_recipes
  ALTER COLUMN band_width_mm DROP NOT NULL;
