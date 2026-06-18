-- Ensure all columns from migration 049 exist.
-- Uses ADD COLUMN IF NOT EXISTS so this is safe to re-run on any environment
-- where 049 did or did not previously run.

-- pricing_products
ALTER TABLE pricing_products
  ADD COLUMN IF NOT EXISTS tenant_id      uuid,
  ADD COLUMN IF NOT EXISTS product_type   text,
  ADD COLUMN IF NOT EXISTS product_status text DEFAULT 'in_stock';

-- pricing_product_variants
ALTER TABLE pricing_product_variants
  ADD COLUMN IF NOT EXISTS pricing_mode     text    DEFAULT 'our_build',
  ADD COLUMN IF NOT EXISTS last_direct_cost numeric,
  ADD COLUMN IF NOT EXISTS diamond_type     text    DEFAULT 'none';

-- inventory_pieces
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS gram_weight      numeric,
  ADD COLUMN IF NOT EXISTS last_direct_cost numeric,
  ADD COLUMN IF NOT EXISTS product_status   text DEFAULT 'in_stock';
