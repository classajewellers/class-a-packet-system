-- Metal rates
CREATE TABLE IF NOT EXISTS pricing_metal_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metal_type text NOT NULL UNIQUE,
  price_per_gram numeric(10,2) NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO pricing_metal_rates (metal_type, price_per_gram) VALUES
  ('9ct Yellow Gold', 42.00),
  ('9ct White Gold', 42.00),
  ('9ct Rose Gold', 42.00),
  ('18ct Yellow Gold', 85.00),
  ('18ct White Gold', 85.00),
  ('18ct Rose Gold', 85.00),
  ('Platinum', 120.00)
ON CONFLICT (metal_type) DO NOTHING;

-- Fixed costs
CREATE TABLE IF NOT EXISTS pricing_fixed_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  amount numeric(10,2) NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO pricing_fixed_costs (key, label, amount) VALUES
  ('labour', 'Labour', 300.00),
  ('main_stone_setting', 'Main Stone Setting', 80.00),
  ('small_setting', 'Small Stone Setting (each)', 30.00),
  ('butterflies', 'Butterflies (earrings add-on)', 15.00),
  ('chain', 'Chain (bracelet/necklace add-on)', 40.00)
ON CONFLICT (key) DO NOTHING;

-- Margin brackets
CREATE TABLE IF NOT EXISTS pricing_margin_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_min numeric(10,2) NOT NULL,
  cost_max numeric(10,2),
  multiplier numeric(5,3) NOT NULL
);

INSERT INTO pricing_margin_brackets (cost_min, cost_max, multiplier) VALUES
  (0, 500, 3.200),
  (501, 1000, 2.950),
  (1001, 1500, 2.850),
  (1501, 2000, 2.750),
  (2001, 5000, 2.500),
  (5001, 7500, 2.400),
  (7501, 12500, 2.300)
ON CONFLICT DO NOTHING;

-- Melee stone prices
CREATE TABLE IF NOT EXISTS pricing_melee_stones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  size_label text NOT NULL,
  stone_type text NOT NULL,
  price_per_stone numeric(10,4) NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(size_label, stone_type)
);

INSERT INTO pricing_melee_stones (size_label, stone_type, price_per_stone) VALUES
  ('0.005ct', 'Lab Grown', 0.00), ('0.005ct', 'Natural', 0.00),
  ('0.01ct', 'Lab Grown', 0.00), ('0.01ct', 'Natural', 0.00),
  ('0.02ct', 'Lab Grown', 0.00), ('0.02ct', 'Natural', 0.00),
  ('0.03ct', 'Lab Grown', 0.00), ('0.03ct', 'Natural', 0.00),
  ('0.05ct', 'Lab Grown', 0.00), ('0.05ct', 'Natural', 0.00),
  ('0.10ct', 'Lab Grown', 0.00), ('0.10ct', 'Natural', 0.00)
ON CONFLICT (size_label, stone_type) DO NOTHING;

-- Quote templates
CREATE TABLE IF NOT EXISTS quote_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  includes_labour boolean DEFAULT true,
  includes_main_stone_setting boolean DEFAULT false,
  includes_chain boolean DEFAULT false,
  includes_butterflies boolean DEFAULT false,
  default_metal text,
  sort_order int DEFAULT 0
);

INSERT INTO quote_templates (name, includes_labour, includes_main_stone_setting, includes_chain, includes_butterflies, default_metal, sort_order) VALUES
  ('Engagement Ring', true, true, false, false, '18ct Yellow Gold', 1),
  ('Ring Resize / Repair', true, false, false, false, '18ct Yellow Gold', 2),
  ('Pendant / Necklace', true, true, true, false, '18ct Yellow Gold', 3),
  ('Earrings', true, true, false, true, '18ct Yellow Gold', 4),
  ('Bracelet / Bangle', true, false, true, false, '18ct Yellow Gold', 5),
  ('Custom Job', true, false, false, false, '18ct Yellow Gold', 6)
ON CONFLICT DO NOTHING;

-- Add quote builder columns to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_builder_data jsonb;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quoted_price numeric(10,2);

-- Disable RLS on new tables
ALTER TABLE pricing_metal_rates DISABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_fixed_costs DISABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_margin_brackets DISABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_melee_stones DISABLE ROW LEVEL SECURITY;
ALTER TABLE quote_templates DISABLE ROW LEVEL SECURITY;
