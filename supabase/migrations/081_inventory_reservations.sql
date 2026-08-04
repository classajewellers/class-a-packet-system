-- 081_inventory_reservations.sql
--
-- Creates inventory_reservations table for tracking which pieces are held
-- for specific customers, quotes, orders, or workshop jobs.
--
-- Design notes:
--   - A partial unique index enforces at most one 'active' reservation per piece.
--   - previous_status_id stores the piece's status before reservation so Release
--     can cleanly revert it without guessing.
--   - expires_at is stored for future background-job expiry processing — no
--     automatic expiry is implemented here.
--   - status values: active, released, converted (turned into a sale), expired
--     (manual only — no cron yet).

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  piece_id            uuid          NOT NULL REFERENCES inventory_pieces(id) ON DELETE CASCADE,
  customer_id         uuid          REFERENCES customers(id) ON DELETE SET NULL,
  reason              text,
  quote_reference     text,
  order_reference     text,
  workshop_packet_id  uuid          REFERENCES packets(id) ON DELETE SET NULL,
  created_by          uuid          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  expires_at          timestamptz,
  previous_status_id  uuid          REFERENCES inventory_statuses(id) ON DELETE SET NULL,
  status              text          NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released', 'converted', 'expired')),
  released_at         timestamptz,
  release_reason      text,
  converted_sale_id   uuid          REFERENCES inventory_sales(id) ON DELETE SET NULL
);

ALTER TABLE inventory_reservations DISABLE ROW LEVEL SECURITY;

-- Only one active reservation per piece at a time
CREATE UNIQUE INDEX IF NOT EXISTS inventory_reservations_one_active_per_piece
  ON inventory_reservations (piece_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS inventory_reservations_tenant_idx
  ON inventory_reservations (tenant_id);

CREATE INDEX IF NOT EXISTS inventory_reservations_piece_idx
  ON inventory_reservations (piece_id);

CREATE INDEX IF NOT EXISTS inventory_reservations_customer_idx
  ON inventory_reservations (customer_id);

CREATE INDEX IF NOT EXISTS inventory_reservations_status_idx
  ON inventory_reservations (tenant_id, status);
