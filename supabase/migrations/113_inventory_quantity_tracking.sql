-- 113_inventory_quantity_tracking.sql
--
-- Serialized vs quantity inventory tracking.
--
-- Serialized variants keep using inventory_pieces exactly as today — no change
-- to any existing Piece behaviour. Quantity-tracked variants (e.g. Cleo Huggies)
-- instead hold a per-location on-hand count plus FIFO cost layers, so identical
-- stock does not need one Piece row per physical unit.
--
-- tracking_mode is a DELIBERATE human choice made when setting up a Variant —
-- it is NEVER inferred from heuristics. It defaults to 'serialized' so every
-- existing variant keeps its current behaviour.
--
-- Scope of this migration: the data model + the standalone receiving side only.
-- Selling quantity-tracked stock (FIFO consumption, COGS snapshot on the sale
-- row) and PO-receive integration (po_lines.variant_id) are separate later
-- builds. quantity_remaining is included now so FIFO depletion works later
-- without a schema change.

-- ── 1. Per-variant tracking mode ────────────────────────────────────────────
ALTER TABLE inventory_product_variants
  ADD COLUMN IF NOT EXISTS tracking_mode text NOT NULL DEFAULT 'serialized'
    CHECK (tracking_mode IN ('serialized', 'quantity'));

-- ── 2. Stock levels — one on-hand count per (variant, location) ──────────────
-- Used ONLY when tracking_mode = 'quantity'.
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

-- ── 3. Stock receipts — FIFO cost layers ────────────────────────────────────
-- Each time quantity-tracked stock arrives, log the real unit cost paid at that
-- moment. quantity_remaining depletes oldest-first when the stock is later sold
-- (sale flow is a separate build). Modeled on inventory_receiving_events but
-- purpose-built with a remaining-quantity counter. The PO linkage columns are
-- nullable now (standalone receive) and get populated once PO integration lands.
CREATE TABLE IF NOT EXISTS inventory_stock_receipts (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                bigserial,    -- monotonic arrival order; the FIFO tiebreak
                                   -- when two layers share received_date
  tenant_id          uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variant_id         uuid          NOT NULL REFERENCES inventory_product_variants(id) ON DELETE CASCADE,
  location_id        uuid          REFERENCES inventory_locations(id) ON DELETE SET NULL,
  quantity_received  integer       NOT NULL CHECK (quantity_received > 0),
  quantity_remaining integer       NOT NULL CHECK (quantity_remaining >= 0),
  unit_cost          numeric(10,2) NOT NULL CHECK (unit_cost >= 0),
  received_date      timestamptz   NOT NULL DEFAULT now(),
  received_by        uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  -- PO-linkage columns: plain nullable uuids, NO foreign keys here. This build
  -- is standalone-receive only; nothing reads/writes them yet, and their target
  -- tables belong to the PO subsystem — inventory_receiving_events (090) did not
  -- land in production. FKs are added in the later PO-integration build once the
  -- target tables are confirmed present. Keeping the columns now avoids a schema
  -- change then.
  po_id              uuid,
  po_line_id         uuid,
  receiving_event_id uuid,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  CHECK (quantity_remaining <= quantity_received)
);
ALTER TABLE inventory_stock_receipts DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS inventory_stock_receipts_tenant_idx  ON inventory_stock_receipts (tenant_id);
CREATE INDEX IF NOT EXISTS inventory_stock_receipts_variant_idx ON inventory_stock_receipts (variant_id);
-- FIFO consumption reads the oldest layers that still have stock, by variant.
-- Ordered by seq (strict arrival order) so same-timestamp layers are unambiguous.
CREATE INDEX IF NOT EXISTS inventory_stock_receipts_fifo_idx
  ON inventory_stock_receipts (tenant_id, variant_id, seq)
  WHERE quantity_remaining > 0;

-- ── 4. Atomic operations ────────────────────────────────────────────────────
-- Both mutate two rows and must be all-or-nothing, so they run as functions
-- (one implicit transaction per RPC call) rather than sequential client writes.
-- Tenant id is passed in and enforced in every WHERE clause.

-- Move quantity between two locations for a variant.
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

  -- Lock the source row to prevent concurrent over-draw.
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

-- Receive quantity stock: log a FIFO cost layer AND increment on-hand, atomically.
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
