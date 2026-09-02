-- 109: Add material costing fields to inventory_product_variants
--
-- Stage 1 of real material pricing. All columns nullable — populated by
-- supplier import later, never hardcoded at this stage.
--
--   gram_weight        — casting weight in grams (drives metal cost calculation)
--   stone_shape        — e.g. 'round', 'oval' (matches pricing_melee_stones.shape)
--   stone_carat        — total stone weight in carats
--   stone_quality      — quality grade as supplied, e.g. 'E/VS', 'DEF/VS'
--   stone_origin       — 'natural' | 'lab' (drives which price list to look up)
--   supplier_item_code — supplier's own SKU/reference for this variant
--   supplier_cost      — supplier's real bundled cost (AUD); used to back-check
--                        against calculate_price() output during Stage 3 reconciliation

ALTER TABLE inventory_product_variants
  ADD COLUMN IF NOT EXISTS gram_weight        numeric(8,3),
  ADD COLUMN IF NOT EXISTS stone_shape        text,
  ADD COLUMN IF NOT EXISTS stone_carat        numeric(8,3),
  ADD COLUMN IF NOT EXISTS stone_quality      text,
  ADD COLUMN IF NOT EXISTS stone_origin       text CHECK (stone_origin IN ('natural', 'lab', NULL)),
  ADD COLUMN IF NOT EXISTS supplier_item_code text,
  ADD COLUMN IF NOT EXISTS supplier_cost      numeric(10,2);
