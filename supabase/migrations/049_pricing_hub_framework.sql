-- 049_pricing_hub_framework.sql
-- Pricing Hub: extend existing tables, add rate cards and Rapaport price tables

-- inventory_pieces additions
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS gram_weight      numeric,
  ADD COLUMN IF NOT EXISTS last_direct_cost numeric,
  ADD COLUMN IF NOT EXISTS product_status   text DEFAULT 'in_stock';

-- pricing_product_variants additions
ALTER TABLE pricing_product_variants
  ADD COLUMN IF NOT EXISTS pricing_mode     text DEFAULT 'our_build',
  ADD COLUMN IF NOT EXISTS last_direct_cost numeric,
  ADD COLUMN IF NOT EXISTS diamond_type     text DEFAULT 'none';

-- pricing_products additions (tenant scope + new fields)
ALTER TABLE pricing_products
  ADD COLUMN IF NOT EXISTS tenant_id      uuid,
  ADD COLUMN IF NOT EXISTS product_type   text,
  ADD COLUMN IF NOT EXISTS product_status text DEFAULT 'in_stock';

-- Remove hardcoded seeded labour rate entries that should come from rate cards
DELETE FROM pricing_labour_rates
  WHERE rate_name ILIKE '%butterf%'
     OR rate_name ILIKE '%chain%';

-- Rapaport price table (manual entry until API access confirmed)
CREATE TABLE IF NOT EXISTS rapaport_prices (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  shape             text        NOT NULL,
  size_min          numeric     NOT NULL,
  size_max          numeric     NOT NULL,
  colour            text        NOT NULL,
  clarity           text        NOT NULL,
  price_hundreds_usd numeric    NOT NULL,
  rap_date          date        NOT NULL,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE rapaport_prices DISABLE ROW LEVEL SECURITY;

-- Rate cards table — replaces hardcoded labour rates for build/supplier modes
CREATE TABLE IF NOT EXISTS pricing_rate_cards (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL,
  card_type  text        NOT NULL,
  label      text        NOT NULL,
  amount     numeric     NOT NULL,
  unit       text        NOT NULL DEFAULT 'flat',
  sort_order int                  DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pricing_rate_cards DISABLE ROW LEVEL SECURITY;
