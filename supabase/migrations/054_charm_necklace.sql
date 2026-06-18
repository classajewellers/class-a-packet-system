-- Migration 054: Personalised Charm Necklace component library, configs, and purchase orders.
-- Also adds feature_configurable_products flag to tenant_features and supplier_code to inventory_pieces.

-- Feature flag on tenant_features
ALTER TABLE tenant_features
  ADD COLUMN IF NOT EXISTS feature_configurable_products boolean DEFAULT false;

-- Supplier code on inventory_pieces (enables stock check joining on supplier code)
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS supplier_code text;

-- ── Component library ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS charm_components (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  name                text NOT NULL,
  supplier_code       text,
  component_type      text NOT NULL,
  -- chain / gold_initial / diamond_initial /
  -- birthstone_colourstone / birthstone_diamond /
  -- diamond_pendant / charm
  gram_weight         numeric,
  making_charge       numeric DEFAULT 0,
  averaged_cost_9y    numeric,
  averaged_cost_9w    numeric,
  averaged_cost_18y   numeric,
  averaged_cost_18w   numeric,
  available_for       text DEFAULT 'both', -- necklace / bracelet / both
  product_status      text DEFAULT 'in_stock',
  -- in_stock / order_required / custom_order
  labour_per_unit     numeric DEFAULT 40,
  sort_order          int DEFAULT 0,
  active              boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
ALTER TABLE charm_components DISABLE ROW LEVEL SECURITY;

-- ── Configured necklace linked to a quote ────────────────────────────────────

CREATE TABLE IF NOT EXISTS charm_necklace_configs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL,
  quote_id                  uuid,
  quote_line_item_id        text,
  metal                     text NOT NULL,
  -- 9ct_yellow / 9ct_white / 18ct_yellow / 18ct_white
  product_type              text DEFAULT 'necklace', -- necklace / bracelet
  selected_charms           jsonb NOT NULL DEFAULT '[]',
  -- [{ component_id, name, supplier_code, cost, from_stock, inventory_piece_id, status }]
  charm_count               int DEFAULT 0,
  base_cost                 numeric,
  labour_cost               numeric,
  total_cost                numeric,
  retail_price              numeric,
  white_gold_premium        numeric DEFAULT 0,
  purchase_order_generated  boolean DEFAULT false,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);
ALTER TABLE charm_necklace_configs DISABLE ROW LEVEL SECURITY;

-- ── Purchase orders generated from charm necklace conversions ────────────────

CREATE TABLE IF NOT EXISTS charm_purchase_orders (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL,
  order_reference             text NOT NULL,
  quote_id                    uuid,
  charm_necklace_config_id    uuid,
  supplier                    text DEFAULT 'McCaskills',
  status                      text DEFAULT 'pending',
  -- pending / sent / received / cancelled
  items                       jsonb NOT NULL DEFAULT '[]',
  -- [{ supplier_code, name, metal, qty, unit_cost }]
  total_cost                  numeric,
  notes                       text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);
ALTER TABLE charm_purchase_orders DISABLE ROW LEVEL SECURITY;

-- ── Seed: Class A component library ──────────────────────────────────────────

INSERT INTO charm_components (
  tenant_id, name, supplier_code, component_type,
  gram_weight, making_charge,
  averaged_cost_9y, averaged_cost_9w,
  available_for, product_status, labour_per_unit, sort_order
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '45cm Fine Cable Chain', 'CHAIN-45CM', 'chain',
  1.46, 33,
  186, 204,
  'both', 'in_stock', 0, 1
);

INSERT INTO charm_components (
  tenant_id, name, supplier_code, component_type,
  averaged_cost_9y, averaged_cost_9w,
  averaged_cost_18y, averaged_cost_18w,
  available_for, product_status, labour_per_unit, sort_order
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Gold Initial (A-Z)', 'A9477P', 'gold_initial',
  29.57, 35.45, 63.12, 74.75,
  'both', 'in_stock', 40, 2
);

INSERT INTO charm_components (
  tenant_id, name, supplier_code, component_type,
  available_for, product_status, labour_per_unit, sort_order
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Diamond Initial (A-Z)', 'A11391P', 'diamond_initial',
  'both', 'order_required', 40, 3
);

INSERT INTO charm_components (
  tenant_id, name, supplier_code, component_type,
  averaged_cost_9y, averaged_cost_9w,
  averaged_cost_18y, averaged_cost_18w,
  available_for, product_status, labour_per_unit, sort_order
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Birthstone — Colourstone', 'A4186P', 'birthstone_colourstone',
  35.39, 40.21, 65.23, 77.11,
  'both', 'in_stock', 40, 4
);

INSERT INTO charm_components (
  tenant_id, name, supplier_code, component_type,
  averaged_cost_9y, averaged_cost_9w,
  averaged_cost_18y, averaged_cost_18w,
  available_for, product_status, labour_per_unit, sort_order
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Birthstone — Diamond', 'A4186P-D', 'birthstone_diamond',
  84.77, 89.59, 114.60, 126.48,
  'both', 'in_stock', 40, 5
);

INSERT INTO charm_components (
  tenant_id, name, supplier_code, component_type,
  averaged_cost_9y, averaged_cost_9w,
  averaged_cost_18y, averaged_cost_18w,
  available_for, product_status, labour_per_unit, sort_order
) VALUES
(
  '00000000-0000-0000-0000-000000000001',
  'North Star', 'A9855P', 'charm',
  23.00, 26.93, 47.42, 54.63,
  'both', 'in_stock', 40, 6
),
(
  '00000000-0000-0000-0000-000000000001',
  'Butterfly', 'A11328P', 'charm',
  121.35, 131.13, 203.23, 226.67,
  'both', 'in_stock', 40, 7
),
(
  '00000000-0000-0000-0000-000000000001',
  'Bee', 'A11329P', 'charm',
  94.03, 103.87, 171.93, 198.29,
  'both', 'in_stock', 40, 8
),
(
  '00000000-0000-0000-0000-000000000001',
  'Cherry', 'A11330P', 'charm',
  136.03, 154.63, 311.20, 365.83,
  'both', 'in_stock', 40, 9
),
(
  '00000000-0000-0000-0000-000000000001',
  'Bezel Heart', 'A11331P', 'charm',
  124.29, 134.01, 199.91, 223.00,
  'both', 'in_stock', 40, 10
),
(
  '00000000-0000-0000-0000-000000000001',
  'Petite Heart', 'A10164P', 'charm',
  null, null, null, null,
  'both', 'order_required', 40, 11
),
(
  '00000000-0000-0000-0000-000000000001',
  'Petite Starfish', 'A10314P', 'charm',
  null, null, null, null,
  'both', 'order_required', 40, 12
),
(
  '00000000-0000-0000-0000-000000000001',
  'Evil Eye', null, 'charm',
  null, null, null, null,
  'both', 'order_required', 40, 13
),
(
  '00000000-0000-0000-0000-000000000001',
  'Love Story Heart', null, 'charm',
  null, null, null, null,
  'both', 'order_required', 40, 14
),
(
  '00000000-0000-0000-0000-000000000001',
  'Blank Spacer', null, 'charm',
  null, null, null, null,
  'both', 'in_stock', 0, 15
);

-- ── Enable feature for Class A tenant ────────────────────────────────────────

INSERT INTO tenant_features (tenant_id, feature_configurable_products)
VALUES ('00000000-0000-0000-0000-000000000001', true)
ON CONFLICT (tenant_id) DO UPDATE
SET feature_configurable_products = true,
    updated_at = now();
