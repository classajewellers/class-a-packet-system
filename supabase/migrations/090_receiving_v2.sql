-- 090_receiving_v2.sql
--
-- Upgrades the PO → Receiving → Inventory flow to support:
--   1. Partial receiving (received_quantity tracks progress, not just a boolean)
--   2. One-to-many: one PO line → many inventory pieces (via po_line_id on pieces)
--   3. Receiving event history (who received, when, quantity, cost, discrepancies)
--   4. Batch vs individual piece creation (quantity on inventory_pieces)
--
-- All changes are non-destructive (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS).
-- Existing data is backfilled where needed.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Partial receiving — track how many units have actually been received
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory_po_lines
  ADD COLUMN IF NOT EXISTS received_quantity integer NOT NULL DEFAULT 0;

-- Backfill: lines already marked received=true get their full ordered quantity
UPDATE inventory_po_lines
  SET received_quantity = quantity
  WHERE received = true
    AND received_quantity = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Receiving events — audit trail of every receive action
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_receiving_events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_id              uuid        NOT NULL REFERENCES inventory_purchase_orders(id) ON DELETE CASCADE,
  po_line_id         uuid        NOT NULL REFERENCES inventory_po_lines(id) ON DELETE CASCADE,
  received_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  received_at        timestamptz NOT NULL DEFAULT now(),
  quantity_received  integer     NOT NULL DEFAULT 1,
  expected_unit_cost numeric,
  actual_unit_cost   numeric,
  discrepancy_notes  text,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_receiving_events DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS inventory_receiving_events_tenant_idx
  ON inventory_receiving_events (tenant_id);

CREATE INDEX IF NOT EXISTS inventory_receiving_events_po_line_idx
  ON inventory_receiving_events (po_line_id);

CREATE INDEX IF NOT EXISTS inventory_receiving_events_po_idx
  ON inventory_receiving_events (po_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. inventory_pieces — add po_line_id (one-to-many from line → pieces)
--                      and receiving_event_id (ties each piece to the event)
--                      and quantity (for batch/bulk stock vs individually tracked)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS po_line_id uuid
    REFERENCES inventory_po_lines(id) ON DELETE SET NULL;

ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS receiving_event_id uuid
    REFERENCES inventory_receiving_events(id) ON DELETE SET NULL;

-- Batch vs individual: 1 = individually tracked piece, >1 = quantity stock
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

-- Backfill po_line_id from the existing one-to-one relationship on po_lines
UPDATE inventory_pieces ip
  SET po_line_id = pol.id
  FROM inventory_po_lines pol
  WHERE pol.piece_id = ip.id
    AND ip.po_line_id IS NULL;

CREATE INDEX IF NOT EXISTS inventory_pieces_po_line_idx
  ON inventory_pieces (po_line_id);

CREATE INDEX IF NOT EXISTS inventory_pieces_receiving_event_idx
  ON inventory_pieces (receiving_event_id);
