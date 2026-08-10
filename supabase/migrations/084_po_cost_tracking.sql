-- 084_po_cost_tracking.sql
-- Adds estimated_cost and actual_cost to purchase order lines.
-- inventory_purchase_orders and inventory_po_lines are created with
-- IF NOT EXISTS because they were created directly in production and
-- do not exist in earlier migrations — staging needs them created here.

CREATE TABLE IF NOT EXISTS inventory_purchase_orders (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  po_number     text        NOT NULL,
  supplier_id   uuid,
  supplier_name text,
  order_date    date,
  expected_date date,
  notes         text,
  status        text        NOT NULL DEFAULT 'draft',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz
);

ALTER TABLE inventory_purchase_orders DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS inventory_po_lines (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  po_id         uuid        NOT NULL REFERENCES inventory_purchase_orders(id) ON DELETE CASCADE,
  title         text,
  category_id   uuid,
  metal_type    text,
  metal_karat   text,
  metal_colour  text,
  stone_type    text,
  stone_carat   numeric,
  stone_colour  text,
  stone_clarity text,
  finger_size   text,
  quantity      integer     NOT NULL DEFAULT 1,
  unit_cost     numeric,
  notes         text,
  received      boolean     NOT NULL DEFAULT false,
  piece_id      uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_po_lines DISABLE ROW LEVEL SECURITY;

-- New cost tracking columns
ALTER TABLE inventory_po_lines ADD COLUMN IF NOT EXISTS estimated_cost numeric;
ALTER TABLE inventory_po_lines ADD COLUMN IF NOT EXISTS actual_cost    numeric;

-- Backfill: copy existing unit_cost into estimated_cost for any existing lines
UPDATE inventory_po_lines
SET estimated_cost = unit_cost
WHERE unit_cost IS NOT NULL
  AND estimated_cost IS NULL;
