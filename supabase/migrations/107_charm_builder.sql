-- ─────────────────────────────────────────────────────────────────────────────
-- 107: Personalised Charm Builder — flat-retail-price catalog, base config,
--      build records, and aftermarket add-a-charm rates.
--
-- These tables implement the Shopify flat-retail-price model, which is the
-- ONLY model used to price personalised charm necklaces for customers.
-- They are completely independent of charm_components (wholesale cost catalog)
-- and charm_necklace_configs (old dead-code cost-derived records).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Pendant catalog ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS charm_catalog_items (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid          NOT NULL,
  category     text          NOT NULL,
  -- alphabet | diamond_alphabet | named_charm | birthstone | diamond_shape
  name         text          NOT NULL,
  price        numeric(10,2) NOT NULL,
  applies_to   text          NOT NULL DEFAULT 'both',
  -- necklace | bracelet | both
  month_number integer,
  -- birthstone rows only: 1=January … 12=December; NULL elsewhere
  active       boolean       NOT NULL DEFAULT true,
  sort_order   integer       NOT NULL DEFAULT 0,
  created_at   timestamptz   DEFAULT now(),
  CONSTRAINT charm_catalog_items_tenant_category_name_key
    UNIQUE (tenant_id, category, name)
);
ALTER TABLE charm_catalog_items DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS charm_catalog_items_tenant_idx
  ON charm_catalog_items (tenant_id, active);


-- ── 2. Base pricing config per product type ───────────────────────────────────

CREATE TABLE IF NOT EXISTS charm_base_config (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid          NOT NULL,
  product_type            text          NOT NULL,   -- necklace | bracelet
  base_price              numeric(10,2),
  slot_fee_2              numeric(10,2),
  slot_fee_3              numeric(10,2),
  slot_fee_4              numeric(10,2),
  slot_fee_5              numeric(10,2),
  slot_fee_6              numeric(10,2),
  metal_surcharge_yellow  numeric(10,2),
  metal_surcharge_white   numeric(10,2),
  min_pendants            integer DEFAULT 2,
  max_pendants            integer DEFAULT 6,
  UNIQUE (tenant_id, product_type)
);
ALTER TABLE charm_base_config DISABLE ROW LEVEL SECURITY;


-- ── 3. Saved build records ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS charm_builder_configs (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid          NOT NULL,
  quote_id        uuid,         -- nullable; links to quotes when used in quoting
  product_type    text          NOT NULL,   -- necklace | bracelet
  metal_colour    text          NOT NULL,   -- yellow | white
  base_price      numeric(10,2) NOT NULL,
  slot_fee        numeric(10,2) NOT NULL,
  metal_surcharge numeric(10,2) NOT NULL,
  pendant_total   numeric(10,2) NOT NULL,
  total_price     numeric(10,2) NOT NULL,
  pendants        jsonb         NOT NULL DEFAULT '[]',
  -- [{catalog_item_id, category, name, price}]
  created_at      timestamptz   DEFAULT now()
);
ALTER TABLE charm_builder_configs DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS charm_builder_configs_tenant_idx
  ON charm_builder_configs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS charm_builder_configs_quote_idx
  ON charm_builder_configs (quote_id) WHERE quote_id IS NOT NULL;


-- ── 4. Mode 2: add-a-charm-to-existing-piece flat rates ──────────────────────

CREATE TABLE IF NOT EXISTS charm_aftermarket_rates (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid          NOT NULL,
  charm_type    text          NOT NULL,
  -- initial | birthstone | april_diamond | love_story | diamond_030ct
  metal_colour  text          NOT NULL,   -- yellow | white
  charm_price   numeric(10,2) NOT NULL,
  soldering_fee numeric(10,2) NOT NULL DEFAULT 40,
  total_price   numeric(10,2) GENERATED ALWAYS AS (charm_price + soldering_fee) STORED,
  active        boolean       NOT NULL DEFAULT true,
  UNIQUE (tenant_id, charm_type, metal_colour)
);
ALTER TABLE charm_aftermarket_rates DISABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════════════
-- SEED — Class A tenant
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Necklace base config (confirmed from Shopify admin) ───────────────────────
INSERT INTO charm_base_config (
  tenant_id, product_type,
  base_price,
  slot_fee_2, slot_fee_3, slot_fee_4, slot_fee_5, slot_fee_6,
  metal_surcharge_yellow, metal_surcharge_white,
  min_pendants, max_pendants
) VALUES (
  '00000000-0000-0000-0000-000000000001', 'necklace',
  515,
  80, 120, 160, 200, 240,
  10, 35,
  2, 6
) ON CONFLICT (tenant_id, product_type) DO NOTHING;

-- ── Bracelet base config (UNCONFIRMED — all NULLs pending real bracelet data) ─
INSERT INTO charm_base_config (
  tenant_id, product_type,
  base_price,
  slot_fee_2, slot_fee_3, slot_fee_4, slot_fee_5, slot_fee_6,
  metal_surcharge_yellow, metal_surcharge_white,
  min_pendants, max_pendants
) VALUES (
  '00000000-0000-0000-0000-000000000001', 'bracelet',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  2, 6
) ON CONFLICT (tenant_id, product_type) DO NOTHING;

-- ── Plain alphabet initial ────────────────────────────────────────────────────
INSERT INTO charm_catalog_items (tenant_id, category, name, price, applies_to, sort_order)
VALUES ('00000000-0000-0000-0000-000000000001', 'alphabet', 'Any Letter (A–Z)', 100, 'necklace', 1)
ON CONFLICT (tenant_id, category, name) DO NOTHING;

-- ── Diamond alphabet initial ──────────────────────────────────────────────────
INSERT INTO charm_catalog_items (tenant_id, category, name, price, applies_to, sort_order)
VALUES ('00000000-0000-0000-0000-000000000001', 'diamond_alphabet', 'Any Letter (A–Z)', 380, 'necklace', 1)
ON CONFLICT (tenant_id, category, name) DO NOTHING;

-- ── Named charms ──────────────────────────────────────────────────────────────
INSERT INTO charm_catalog_items (tenant_id, category, name, price, applies_to, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'named_charm', 'Petite Heart',     125, 'necklace', 1),
  ('00000000-0000-0000-0000-000000000001', 'named_charm', 'Evil Eye',         240, 'necklace', 2),
  ('00000000-0000-0000-0000-000000000001', 'named_charm', 'Love Story Heart',  90, 'necklace', 3),
  ('00000000-0000-0000-0000-000000000001', 'named_charm', 'Starlight Trio',   395, 'necklace', 4),
  ('00000000-0000-0000-0000-000000000001', 'named_charm', 'Butterfly',        450, 'necklace', 5),
  ('00000000-0000-0000-0000-000000000001', 'named_charm', 'Bee',              315, 'necklace', 6),
  ('00000000-0000-0000-0000-000000000001', 'named_charm', 'Cherry',           370, 'necklace', 7),
  ('00000000-0000-0000-0000-000000000001', 'named_charm', 'Heart Diamond',    750, 'necklace', 8),
  ('00000000-0000-0000-0000-000000000001', 'named_charm', 'Petite Starfish',  140, 'necklace', 9)
ON CONFLICT (tenant_id, category, name) DO NOTHING;

-- ── Birthstones — Jan–Dec; April is diamond ($255), all others $100 ───────────
INSERT INTO charm_catalog_items (tenant_id, category, name, price, applies_to, month_number, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'January',    100, 'necklace',  1,  1),
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'February',   100, 'necklace',  2,  2),
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'March',      100, 'necklace',  3,  3),
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'April',      255, 'necklace',  4,  4),
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'May',        100, 'necklace',  5,  5),
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'June',       100, 'necklace',  6,  6),
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'July',       100, 'necklace',  7,  7),
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'August',     100, 'necklace',  8,  8),
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'September',  100, 'necklace',  9,  9),
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'October',    100, 'necklace', 10, 10),
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'November',   100, 'necklace', 11, 11),
  ('00000000-0000-0000-0000-000000000001', 'birthstone', 'December',   100, 'necklace', 12, 12)
ON CONFLICT (tenant_id, category, name) DO NOTHING;

-- ── Diamond shape pendants (all $740, shape has no price effect) ──────────────
INSERT INTO charm_catalog_items (tenant_id, category, name, price, applies_to, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'diamond_shape', 'Round',           740, 'necklace', 1),
  ('00000000-0000-0000-0000-000000000001', 'diamond_shape', 'Oval',            740, 'necklace', 2),
  ('00000000-0000-0000-0000-000000000001', 'diamond_shape', 'East West Oval',  740, 'necklace', 3),
  ('00000000-0000-0000-0000-000000000001', 'diamond_shape', 'Emerald',         740, 'necklace', 4),
  ('00000000-0000-0000-0000-000000000001', 'diamond_shape', 'Marquise',        740, 'necklace', 5),
  ('00000000-0000-0000-0000-000000000001', 'diamond_shape', 'Pear',            740, 'necklace', 6)
ON CONFLICT (tenant_id, category, name) DO NOTHING;

-- ── Aftermarket rates (Mode 2: add charm to existing piece) ──────────────────
-- soldering_fee is $40 flat for every row; total_price is generated (charm_price + soldering_fee)
INSERT INTO charm_aftermarket_rates (tenant_id, charm_type, metal_colour, charm_price, soldering_fee) VALUES
  ('00000000-0000-0000-0000-000000000001', 'initial',       'yellow',  90, 40),
  ('00000000-0000-0000-0000-000000000001', 'birthstone',    'yellow',  90, 40),
  ('00000000-0000-0000-0000-000000000001', 'april_diamond', 'yellow', 170, 40),
  ('00000000-0000-0000-0000-000000000001', 'love_story',    'yellow',  60, 40),
  ('00000000-0000-0000-0000-000000000001', 'diamond_030ct', 'yellow', 750, 40),
  ('00000000-0000-0000-0000-000000000001', 'initial',       'white',   95, 40),
  ('00000000-0000-0000-0000-000000000001', 'birthstone',    'white',   95, 40),
  ('00000000-0000-0000-0000-000000000001', 'april_diamond', 'white',  175, 40),
  ('00000000-0000-0000-0000-000000000001', 'love_story',    'white',   65, 40),
  ('00000000-0000-0000-0000-000000000001', 'diamond_030ct', 'white',  755, 40)
ON CONFLICT (tenant_id, charm_type, metal_colour) DO NOTHING;
