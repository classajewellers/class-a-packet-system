-- 079_inventory_products_and_sales.sql
--
-- Adds five new tables to the inventory/RFID module:
--   1. inventory_products        — product blueprint layer (templates shared across pieces)
--   2. inventory_sales           — sale event record per piece
--   3. tenant_rfid_connections   — one bridge record per tenant (RFID print bridge)
--   4. tenant_rfid_handhelds     — multiple handheld scanners per tenant
--   5. print_jobs                — polling queue for the RFID print bridge
--
-- Also wires the existing (unused) inventory_pieces.product_id column to
-- inventory_products via FK now that the target table exists.
--
-- Does NOT touch: inventory_statuses, inventory_categories, inventory_locations,
-- inventory_suppliers, inventory_movements, inventory_purchase_orders,
-- inventory_po_lines, or any existing inventory_pieces columns.
--
-- Verified preconditions (confirmed against production 2026-08-04):
--   - inventory_pieces.product_id  exists (nullable uuid, no FK yet)
--   - inventory_products            does NOT exist — created here
--   - inventory_sales               does NOT exist — created here
--   - tenant_rfid_connections       does NOT exist — created here
--   - tenant_rfid_handhelds         does NOT exist — created here
--   - print_jobs                    does NOT exist — created here

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. inventory_products
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_products (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                   text        NOT NULL,
  collection             text,
  category_id            uuid        REFERENCES inventory_categories(id) ON DELETE SET NULL,
  design                 text,
  style                  text,
  setting_type           text,
  manufacturing_info     text,
  cad_file_url           text,
  marketing_description  text,
  website_description    text,
  seo_title              text,
  seo_description        text,
  care_instructions      text,
  available_metals       jsonb       NOT NULL DEFAULT '[]',
  available_stone_types  jsonb       NOT NULL DEFAULT '[]',
  available_stone_shapes jsonb       NOT NULL DEFAULT '[]',
  available_sizes        jsonb       NOT NULL DEFAULT '[]',
  shopify_product_id     text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_products DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS inventory_products_tenant_idx
  ON inventory_products (tenant_id);

CREATE INDEX IF NOT EXISTS inventory_products_category_idx
  ON inventory_products (category_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Wire inventory_pieces.product_id → inventory_products(id)
--
--    Column already exists in production. FK added only if not already present.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  constraint_name = 'inventory_pieces_product_id_fkey'
      AND  table_name      = 'inventory_pieces'
  ) THEN
    ALTER TABLE inventory_pieces
      ADD CONSTRAINT inventory_pieces_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES inventory_products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inventory_pieces_product_id_idx
  ON inventory_pieces (product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. inventory_sales
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_sales (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  piece_id         uuid          NOT NULL REFERENCES inventory_pieces(id) ON DELETE RESTRICT,
  sold_price       numeric(12,2) NOT NULL,
  discount_amount  numeric(12,2) NOT NULL DEFAULT 0,
  staff_id         uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  customer_id      uuid          REFERENCES customers(id) ON DELETE SET NULL,
  order_reference  text,
  payment_method   text,
  sold_at          timestamptz   NOT NULL DEFAULT now(),
  notes            text,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE inventory_sales DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS inventory_sales_tenant_idx
  ON inventory_sales (tenant_id);

CREATE INDEX IF NOT EXISTS inventory_sales_piece_idx
  ON inventory_sales (piece_id);

CREATE INDEX IF NOT EXISTS inventory_sales_staff_idx
  ON inventory_sales (staff_id);

CREATE INDEX IF NOT EXISTS inventory_sales_customer_idx
  ON inventory_sales (customer_id);

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

CREATE INDEX IF NOT EXISTS tenant_rfid_connections_tenant_idx
  ON tenant_rfid_connections (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. tenant_rfid_handhelds — multiple handheld scanners per tenant
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

CREATE INDEX IF NOT EXISTS print_jobs_tenant_idx
  ON print_jobs (tenant_id);

CREATE INDEX IF NOT EXISTS print_jobs_piece_idx
  ON print_jobs (piece_id);

CREATE INDEX IF NOT EXISTS print_jobs_tenant_status_idx
  ON print_jobs (tenant_id, status);
