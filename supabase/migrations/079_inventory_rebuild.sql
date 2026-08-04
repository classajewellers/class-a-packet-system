-- 079_inventory_rebuild.sql
-- Foundational inventory model rebuild:
--   1. Rename inventory_designs → inventory_products, add product blueprint columns
--   2. Extend inventory_pieces: rename design_id→product_id, add identifier/cost/
--      customer columns, remap and expand status values
--   3. New: inventory_piece_components (self-referencing assembly links)
--   4. New: tenant_rfid_connections (one per tenant, RFID print bridge)
--   5. New: tenant_rfid_handhelds (multiple handheld scanners per tenant)
--   6. New: print_jobs (polling queue for bridge)
--
-- Does NOT touch: inventory_items, inventory_stock, inventory_movements (legacy).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rename inventory_designs → inventory_products
-- ─────────────────────────────────────────────────────────────────────────────
-- PostgreSQL automatically updates all FK references pointing at inventory_designs
-- to point at inventory_products — no manual FK surgery required.

ALTER TABLE inventory_designs RENAME TO inventory_products;

-- Add product blueprint columns
ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS collection              text,
  ADD COLUMN IF NOT EXISTS design                  text,
  ADD COLUMN IF NOT EXISTS style                   text,
  ADD COLUMN IF NOT EXISTS setting_type            text,
  ADD COLUMN IF NOT EXISTS manufacturing_info      text,
  ADD COLUMN IF NOT EXISTS cad_file_url            text,
  ADD COLUMN IF NOT EXISTS marketing_description   text,
  ADD COLUMN IF NOT EXISTS website_description     text,
  ADD COLUMN IF NOT EXISTS seo_title               text,
  ADD COLUMN IF NOT EXISTS seo_description         text,
  ADD COLUMN IF NOT EXISTS care_instructions       text,
  ADD COLUMN IF NOT EXISTS available_metals        jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS available_stone_types   jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS available_stone_shapes  jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS available_sizes         jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS shopify_product_id      text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Extend inventory_pieces
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. Rename design_id → product_id (FK now references inventory_products by
--     virtue of the table rename above; column rename is the only change needed).
--     Idempotent: skips if column already renamed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_pieces' AND column_name = 'design_id'
  ) THEN
    ALTER TABLE inventory_pieces RENAME COLUMN design_id TO product_id;
  END IF;
END $$;

-- Drop stale index created under the old column name, recreate under new name.
DROP INDEX IF EXISTS inventory_pieces_design_id_idx;
CREATE INDEX IF NOT EXISTS inventory_pieces_product_id_idx ON inventory_pieces (product_id);

-- 2b. Identifier columns
--     supplier_code already exists (migration 054) — ADD COLUMN IF NOT EXISTS is a no-op.
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS supplier_code  text,    -- no-op; kept for idempotency
  ADD COLUMN IF NOT EXISTS rfid_tag       text,
  ADD COLUMN IF NOT EXISTS barcode        text,
  ADD COLUMN IF NOT EXISTS stock_code     text,
  ADD COLUMN IF NOT EXISTS serial_number  text;

-- 2c. Cost / price columns
--     actual_cost:      locked at creation; reflects what was paid; never updated.
--     replacement_cost: updated from gold price / supplier feed runs.
--     retail_price already exists on the table (migration 029) — no-op below.
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS actual_cost       numeric(12,2),
  ADD COLUMN IF NOT EXISTS replacement_cost  numeric(12,2);

-- 2d. Customer linkage (e.g. reserved/layby/commission piece for a specific customer)
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

-- 2e. Status remap and constraint expansion
--
--   Mapping:
--     in_stock    → available    (on floor/storage, ready for sale)
--     on_order    → ordered      (PO raised, not yet received)
--     sold        → sold         (no change)
--     workshop    → workshop     (no change)
--     consignment → consignment  (kept — out on consignment, distinct state)
--     repair      → repair       (kept — external repair, distinct from workshop)
--
--   New values: received, reserved, awaiting_pickup, returned, archived
--
-- NOTE: app/api/charm-components/route.ts and app/api/charm-necklace/configure/route.ts
--   previously filtered status = 'in_stock' — both files are updated in this same commit
--   to use status = 'available'.

ALTER TABLE inventory_pieces DROP CONSTRAINT IF EXISTS inventory_pieces_status_check;

UPDATE inventory_pieces SET status = 'available' WHERE status = 'in_stock';
UPDATE inventory_pieces SET status = 'ordered'   WHERE status = 'on_order';

ALTER TABLE inventory_pieces
  ADD CONSTRAINT inventory_pieces_status_check
  CHECK (status IN (
    'ordered',          -- PO raised, awaiting delivery from supplier
    'received',         -- received from supplier, not yet processed/tagged/put away
    'available',        -- in stock, on floor or storage, ready for sale
    'reserved',         -- held against a quote, layby, or customer commission
    'workshop',         -- in-house workshop (production, fabrication, service)
    'awaiting_pickup',  -- job complete, customer notified, awaiting collection
    'sold',             -- sold and collected by customer
    'returned',         -- returned by customer, back in possession
    'archived',         -- written off, lost, or removed from active inventory
    'consignment',      -- physically out on consignment with third party
    'repair'            -- sent to external repairer (distinct from in-house workshop)
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. inventory_piece_components — assembly / component linking
-- ─────────────────────────────────────────────────────────────────────────────
-- Allows a piece to reference other pieces as components (e.g. a ring
-- assembly composed of a casting + a stone + a setting component piece).

CREATE TABLE IF NOT EXISTS inventory_piece_components (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_piece_id    uuid        NOT NULL REFERENCES inventory_pieces(id) ON DELETE CASCADE,
  component_piece_id uuid        NOT NULL REFERENCES inventory_pieces(id) ON DELETE RESTRICT,
  quantity           integer     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_piece_components_no_self_ref
    CHECK (parent_piece_id <> component_piece_id)
);

ALTER TABLE inventory_piece_components DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS inventory_piece_components_parent_idx
  ON inventory_piece_components (parent_piece_id);
CREATE INDEX IF NOT EXISTS inventory_piece_components_component_idx
  ON inventory_piece_components (component_piece_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. tenant_rfid_connections — one bridge record per tenant
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_rfid_connections (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pairing_code     text,
  bridge_connected boolean     NOT NULL DEFAULT false,
  printer_name     text,
  last_seen_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_rfid_connections_tenant_unique UNIQUE (tenant_id)
);

ALTER TABLE tenant_rfid_connections DISABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. tenant_rfid_handhelds — multiple scanners per tenant
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_rfid_handhelds (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_name      text        NOT NULL,
  paired_at        timestamptz NOT NULL DEFAULT now(),
  qr_pairing_token text,
  last_active_at   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_rfid_handhelds DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS tenant_rfid_handhelds_tenant_idx
  ON tenant_rfid_handhelds (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. print_jobs — polling queue for the RFID print bridge
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS print_jobs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  piece_id    uuid        NOT NULL REFERENCES inventory_pieces(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'printed', 'failed')),
  zpl_payload text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  printed_at  timestamptz
);

ALTER TABLE print_jobs DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS print_jobs_tenant_status_idx
  ON print_jobs (tenant_id, status);
CREATE INDEX IF NOT EXISTS print_jobs_piece_idx
  ON print_jobs (piece_id);
