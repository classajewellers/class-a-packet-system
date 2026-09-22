-- 139: close the inventory_product_variants / quantity-tracking staging drift
--
-- Investigation (2026-09-22): while adding reorder points (migration 138) I
-- found inventory_product_variants and inventory_stock_levels missing from
-- vault-staging. Checking further revealed the drift is bigger than those
-- two tables — migration 095 creates FOUR tables (design_band_recipes,
-- inventory_product_variants, pricing_component_rules,
-- price_calculation_snapshots); only TWO of them (design_band_recipes,
-- pricing_component_rules) actually exist on staging today, confirmed via
-- direct query. inventory_product_variants and price_calculation_snapshots
-- are both missing. Migration 096 (which adds RLS policies for all four 095
-- tables, plus creates pricing_birthstones) could not have completed
-- successfully either, since two of the four tables its policies target
-- don't exist — consistent with pricing_birthstones also being confirmed
-- missing on staging. This reads as migration 095 having been applied as
-- partial/separate statements at some point rather than as one file, with
-- the run stopping partway, rather than a clean "never ran at all."
--
-- Real-world impact check: the LATEST calculate_price() definition
-- (migration 134) does NOT reference inventory_product_variants or
-- price_calculation_snapshots — the core quote-pricing engine is not
-- affected by this drift. What IS affected: quantity-tracked stock
-- (migration 113 — the "Cleo Huggies" example in that file's own comments),
-- any variant-level material-costing fields (migration 109/111), and the
-- birthstone lookup used by the Ring Builder (migration 096). If any of
-- these have been tested/used on staging, they would have been failing
-- with "table not found" errors.
--
-- ⚠️ PRODUCTION CHECK NEEDED BEFORE APPLYING THERE: this migration is
-- staging-only for now. Before ever running it against production, confirm
-- production actually has all of: inventory_product_variants,
-- price_calculation_snapshots, inventory_stock_levels,
-- inventory_stock_receipts, pricing_birthstones (a simple SELECT ... LIMIT 1
-- against each, same read-only check used to find this drift). If
-- production is missing any of them too, that's a much bigger, separate
-- conversation — this migration would need review before touching prod
-- regardless, per standing policy.
--
-- Every statement below is copied verbatim from its original migration
-- (095, 096, 109, 111, 113) with IF NOT EXISTS / DROP-then-CREATE POLICY
-- guards so this is safe to run regardless of exactly which pieces are
-- already present — same self-healing approach as migrations 136 and 138
-- earlier this session.

-- ── From migration 095: the two missing tables ───────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_product_variants (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  design_id         uuid        NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  name              text,       -- human-readable, e.g. "18ct Yellow Gold 2mm"
  metal_karat       text        NOT NULL,  -- '9K' | '18K' | 'Platinum' | 'Silver'
  metal_colour      text        NOT NULL,  -- 'Yellow' | 'White' | 'Rose' | 'N/A'
  band_width_mm     numeric(4,2),
  claw_config       text,       -- aesthetic only — zero pricing impact
  shopify_variant_id text,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, metal_karat, metal_colour, band_width_mm)
);

ALTER TABLE inventory_product_variants ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS inv_product_variants_design_idx  ON inventory_product_variants (design_id);
CREATE INDEX IF NOT EXISTS inv_product_variants_tenant_idx  ON inventory_product_variants (tenant_id);
CREATE INDEX IF NOT EXISTS inv_product_variants_shopify_idx ON inventory_product_variants (shopify_variant_id) WHERE shopify_variant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS price_calculation_snapshots (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid         NOT NULL,
  quote_id            uuid         REFERENCES quotes(id) ON DELETE CASCADE,
  piece_id            uuid         REFERENCES inventory_pieces(id) ON DELETE SET NULL,
  design_id           uuid         REFERENCES inventory_products(id) ON DELETE SET NULL,
  calculation_mode    text         NOT NULL,  -- 'made_to_order' | 'ready_to_wear'
  inputs              jsonb        NOT NULL,  -- full inputs passed to calculate_price()
  breakdown           jsonb        NOT NULL,  -- full JSONB output from calculate_price()
  total_retail        numeric(10,2) NOT NULL,
  gold_price_used     numeric(10,4),
  stone_wholesale_used numeric(10,4),
  valid_until         timestamptz,
  calculated_at       timestamptz  NOT NULL DEFAULT now(),
  locked_at           timestamptz
);

ALTER TABLE price_calculation_snapshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS price_snapshots_quote_idx  ON price_calculation_snapshots (quote_id);
CREATE INDEX IF NOT EXISTS price_snapshots_tenant_idx ON price_calculation_snapshots (tenant_id);

-- ── From migration 096: RLS policies for all four 095 tables ─────────────────
-- DROP-then-CREATE on every one (not just the two missing tables) since we
-- can't know from here whether design_band_recipes/pricing_component_rules
-- already got their policy in whatever partial run happened before.

DROP POLICY IF EXISTS "tenant_isolation" ON pricing_component_rules;
CREATE POLICY "tenant_isolation" ON pricing_component_rules
  FOR ALL USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation" ON design_band_recipes;
CREATE POLICY "tenant_isolation" ON design_band_recipes
  FOR ALL USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation" ON inventory_product_variants;
CREATE POLICY "tenant_isolation" ON inventory_product_variants
  FOR ALL USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation" ON price_calculation_snapshots;
CREATE POLICY "tenant_isolation" ON price_calculation_snapshots
  FOR ALL USING (tenant_id = current_tenant_id());

-- ── From migration 096: pricing_birthstones (Ring Builder birthstone lookup) ─

CREATE TABLE IF NOT EXISTS pricing_birthstones (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid         NOT NULL,
  month_number   int          NOT NULL CHECK (month_number BETWEEN 1 AND 12),
  stone_name     text         NOT NULL,
  price_per_stone numeric(10,2) NOT NULL CHECK (price_per_stone >= 0),
  fitting_fee    numeric(10,2) NOT NULL DEFAULT 0 CHECK (fitting_fee >= 0),
  notes          text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, month_number)
);

ALTER TABLE pricing_birthstones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON pricing_birthstones;
CREATE POLICY "tenant_isolation" ON pricing_birthstones
  FOR ALL USING (tenant_id = current_tenant_id());

CREATE INDEX IF NOT EXISTS pricing_birthstones_tenant_idx
  ON pricing_birthstones (tenant_id);

INSERT INTO pricing_birthstones (tenant_id, month_number, stone_name, price_per_stone, fitting_fee) VALUES
  ('00000000-0000-0000-0000-000000000001',  1, 'Garnet',     45.00, 25.00),
  ('00000000-0000-0000-0000-000000000001',  2, 'Amethyst',   35.00, 25.00),
  ('00000000-0000-0000-0000-000000000001',  3, 'Aquamarine', 65.00, 30.00),
  ('00000000-0000-0000-0000-000000000001',  4, 'Diamond',   395.00, 50.00),
  ('00000000-0000-0000-0000-000000000001',  5, 'Emerald',   195.00, 35.00),
  ('00000000-0000-0000-0000-000000000001',  6, 'Pearl',      55.00, 25.00),
  ('00000000-0000-0000-0000-000000000001',  7, 'Ruby',      225.00, 35.00),
  ('00000000-0000-0000-0000-000000000001',  8, 'Peridot',    40.00, 25.00),
  ('00000000-0000-0000-0000-000000000001',  9, 'Sapphire',  195.00, 35.00),
  ('00000000-0000-0000-0000-000000000001', 10, 'Opal',       85.00, 30.00),
  ('00000000-0000-0000-0000-000000000001', 11, 'Topaz',      55.00, 25.00),
  ('00000000-0000-0000-0000-000000000001', 12, 'Tanzanite', 145.00, 30.00)
ON CONFLICT (tenant_id, month_number) DO NOTHING;

-- ── From migration 109: variant material-costing fields ──────────────────────

ALTER TABLE inventory_product_variants
  ADD COLUMN IF NOT EXISTS gram_weight        numeric(8,3),
  ADD COLUMN IF NOT EXISTS stone_shape        text,
  ADD COLUMN IF NOT EXISTS stone_carat        numeric(8,3),
  ADD COLUMN IF NOT EXISTS stone_quality      text,
  ADD COLUMN IF NOT EXISTS stone_origin       text CHECK (stone_origin IN ('natural', 'lab', NULL)),
  ADD COLUMN IF NOT EXISTS supplier_item_code text,
  ADD COLUMN IF NOT EXISTS supplier_cost      numeric(10,2);

-- ── From migration 111: stone_quantity ────────────────────────────────────────

ALTER TABLE inventory_product_variants
  ADD COLUMN IF NOT EXISTS stone_quantity numeric(8,0);

-- ── From migration 113: quantity tracking (tracking_mode + stock tables) ─────

ALTER TABLE inventory_product_variants
  ADD COLUMN IF NOT EXISTS tracking_mode text NOT NULL DEFAULT 'serialized'
    CHECK (tracking_mode IN ('serialized', 'quantity'));

CREATE TABLE IF NOT EXISTS inventory_stock_levels (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variant_id  uuid        NOT NULL REFERENCES inventory_product_variants(id) ON DELETE CASCADE,
  location_id uuid        NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  quantity    integer     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, location_id)
);
ALTER TABLE inventory_stock_levels DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS inventory_stock_levels_tenant_idx  ON inventory_stock_levels (tenant_id);
CREATE INDEX IF NOT EXISTS inventory_stock_levels_variant_idx ON inventory_stock_levels (variant_id);

CREATE TABLE IF NOT EXISTS inventory_stock_receipts (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigserial,
  tenant_id          uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variant_id         uuid          NOT NULL REFERENCES inventory_product_variants(id) ON DELETE CASCADE,
  location_id        uuid          REFERENCES inventory_locations(id) ON DELETE SET NULL,
  quantity_received  integer       NOT NULL CHECK (quantity_received > 0),
  quantity_remaining integer       NOT NULL CHECK (quantity_remaining >= 0),
  unit_cost          numeric(10,2) NOT NULL CHECK (unit_cost >= 0),
  received_date      timestamptz   NOT NULL DEFAULT now(),
  received_by        uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  po_id              uuid,
  po_line_id         uuid,
  receiving_event_id uuid,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  CHECK (quantity_remaining <= quantity_received)
);
ALTER TABLE inventory_stock_receipts DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS inventory_stock_receipts_tenant_idx  ON inventory_stock_receipts (tenant_id);
CREATE INDEX IF NOT EXISTS inventory_stock_receipts_variant_idx ON inventory_stock_receipts (variant_id);
CREATE INDEX IF NOT EXISTS inventory_stock_receipts_fifo_idx
  ON inventory_stock_receipts (tenant_id, variant_id, seq)
  WHERE quantity_remaining > 0;

CREATE OR REPLACE FUNCTION move_stock(
  p_tenant        uuid,
  p_variant       uuid,
  p_from_location uuid,
  p_to_location   uuid,
  p_qty           integer
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_from_qty integer;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity to move must be positive';
  END IF;
  IF p_from_location = p_to_location THEN
    RAISE EXCEPTION 'Source and destination locations must differ';
  END IF;

  SELECT quantity INTO v_from_qty
  FROM inventory_stock_levels
  WHERE tenant_id = p_tenant AND variant_id = p_variant AND location_id = p_from_location
  FOR UPDATE;

  IF v_from_qty IS NULL OR v_from_qty < p_qty THEN
    RAISE EXCEPTION 'Insufficient stock at source (have %, need %)', COALESCE(v_from_qty, 0), p_qty;
  END IF;

  UPDATE inventory_stock_levels
  SET quantity = quantity - p_qty, updated_at = now()
  WHERE tenant_id = p_tenant AND variant_id = p_variant AND location_id = p_from_location;

  INSERT INTO inventory_stock_levels (tenant_id, variant_id, location_id, quantity)
  VALUES (p_tenant, p_variant, p_to_location, p_qty)
  ON CONFLICT (variant_id, location_id)
  DO UPDATE SET quantity = inventory_stock_levels.quantity + EXCLUDED.quantity, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION receive_quantity_stock(
  p_tenant      uuid,
  p_variant     uuid,
  p_location    uuid,
  p_qty         integer,
  p_unit_cost   numeric,
  p_received_by uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_receipt_id uuid;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity received must be positive';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost must be zero or greater';
  END IF;

  INSERT INTO inventory_stock_receipts
    (tenant_id, variant_id, location_id, quantity_received, quantity_remaining, unit_cost, received_by)
  VALUES
    (p_tenant, p_variant, p_location, p_qty, p_qty, p_unit_cost, p_received_by)
  RETURNING id INTO v_receipt_id;

  INSERT INTO inventory_stock_levels (tenant_id, variant_id, location_id, quantity)
  VALUES (p_tenant, p_variant, p_location, p_qty)
  ON CONFLICT (variant_id, location_id)
  DO UPDATE SET quantity = inventory_stock_levels.quantity + EXCLUDED.quantity, updated_at = now();

  RETURN v_receipt_id;
END;
$$;
