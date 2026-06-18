-- 048_pricing_framework.sql
-- Pricing Hub: product catalog, variants, build components, supplier costs, gold prices, labour rates

CREATE TABLE IF NOT EXISTS pricing_products (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  category    text,
  description text,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE pricing_products DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pricing_product_variants (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id               uuid        NOT NULL REFERENCES pricing_products(id) ON DELETE CASCADE,
  name                     text        NOT NULL,
  metal_type               text,
  metal_grams              numeric,
  active_pricing_mode      text        NOT NULL DEFAULT 'build',
  target_margin_multiplier numeric     NOT NULL DEFAULT 2.5,
  current_retail           numeric,
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

ALTER TABLE pricing_product_variants DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pricing_build_components (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id     uuid        NOT NULL REFERENCES pricing_product_variants(id) ON DELETE CASCADE,
  component_type text        NOT NULL,
  description    text        NOT NULL,
  quantity       numeric     NOT NULL DEFAULT 1,
  unit_cost      numeric,
  total_cost     numeric,
  is_dynamic     boolean     NOT NULL DEFAULT false,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE pricing_build_components DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pricing_supplier_costs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id         uuid        NOT NULL REFERENCES pricing_product_variants(id) ON DELETE CASCADE,
  supplier_name      text        NOT NULL,
  supplier_item_code text,
  cost_ex_gst        numeric     NOT NULL,
  cost_inc_gst       numeric,
  currency           text        NOT NULL DEFAULT 'AUD',
  price_list_date    date        NOT NULL,
  notes              text,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE pricing_supplier_costs DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pricing_gold_prices (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  metal_type     text        NOT NULL,
  price_per_gram numeric     NOT NULL,
  effective_date date        NOT NULL DEFAULT CURRENT_DATE,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE pricing_gold_prices DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pricing_labour_rates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_name      text        NOT NULL,
  supplier       text,
  rate_per_stone numeric,
  rate_per_hour  numeric,
  rate_flat      numeric,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE pricing_labour_rates DISABLE ROW LEVEL SECURITY;

-- Seed: default gold prices
INSERT INTO pricing_gold_prices (metal_type, price_per_gram, effective_date) VALUES
  ('9ct Yellow',  30.00, CURRENT_DATE),
  ('9ct White',   30.00, CURRENT_DATE),
  ('9ct Rose',    30.00, CURRENT_DATE),
  ('18ct Yellow', 60.00, CURRENT_DATE),
  ('18ct White',  60.00, CURRENT_DATE),
  ('18ct Rose',   60.00, CURRENT_DATE),
  ('Platinum',   110.00, CURRENT_DATE)
ON CONFLICT DO NOTHING;

-- Seed: default labour rates
INSERT INTO pricing_labour_rates (rate_name, rate_per_stone, rate_flat) VALUES
  ('Setting — Claw',      12.00, NULL),
  ('Setting — Bezel',     14.00, NULL),
  ('Setting — Pave',       8.00, NULL),
  ('Setting — Channel',   10.00, NULL),
  ('Polishing — Standard', NULL, 15.00),
  ('Polishing — High',     NULL, 25.00),
  ('Engraving — Per Char', NULL,  3.50),
  ('Rhodium Plating',      NULL, 20.00)
ON CONFLICT DO NOTHING;
