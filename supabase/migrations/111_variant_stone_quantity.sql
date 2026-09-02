-- 111: Add stone_quantity to inventory_product_variants
--
-- Companion to stone_carat (added in migration 109).
-- stone_carat stores weight per individual stone.
-- stone_quantity stores the count of stones set in this variant.
-- Total stone weight = stone_carat × stone_quantity.
--
-- Required to correctly interpret supplier notations like "2=1.0ct"
-- (2 stones totalling 1.0ct → stone_quantity=2, stone_carat=0.50).
-- Any lookup that needs total carat weight must multiply these two columns.

ALTER TABLE inventory_product_variants
  ADD COLUMN IF NOT EXISTS stone_quantity numeric(8,0);
