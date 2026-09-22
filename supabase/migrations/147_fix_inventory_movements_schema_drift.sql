-- 147: bring inventory_movements on staging in line with production
--
-- STAGING DRIFT FOUND during the 2026-09-22 tenant-isolation remediation
-- (Critical batch verification). inventory_movements has a migration
-- history (025_inventory_movements.sql: legacy item_id/quantity/
-- movement_type shape; 035_multi_tenancy.sql: adds tenant_id) but was
-- evidently restructured directly in production at some point after
-- that — the live route code
-- (app/api/inventory/movements/route.ts, app/api/inventory/sales/route.ts,
-- app/api/inventory/reservations/route.ts, etc.) reads/writes
-- piece_id/from_status_id/to_status_id/moved_by/moved_at, none of which
-- appear in any migration file. Same "hand-altered directly in
-- production, never captured in a migration" pattern as
-- inventory_statuses/inventory_categories found earlier this session.
--
-- Real production schema confirmed directly by Josh (2026-09-22, via a
-- column listing), not inferred from code usage:
--   id uuid, tenant_id uuid, piece_id uuid, from_location_id uuid,
--   to_location_id uuid, from_status_id uuid, to_status_id uuid,
--   moved_by uuid, notes text, moved_at timestamptz
--
-- inventory_movements has zero rows on staging (confirmed directly), so
-- this migration both adds the missing columns AND drops the legacy-only
-- ones (item_id, quantity, movement_type, reference, created_by,
-- created_at) to reach exact parity with production — safe here
-- specifically because there is no data to lose. This is NOT the general
-- policy for closing schema drift in this codebase (every other closing
-- migration this session has been additive-only); it's justified only by
-- the empty table.
--
-- Do NOT apply this migration to production — production is already in
-- this shape (that's how the column list above was obtained).

-- ── Add the columns the live app actually uses ───────────────────────────────

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS piece_id uuid REFERENCES inventory_pieces(id) ON DELETE CASCADE;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS from_status_id uuid REFERENCES inventory_statuses(id) ON DELETE SET NULL;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS to_status_id uuid REFERENCES inventory_statuses(id) ON DELETE SET NULL;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS moved_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS moved_at timestamptz NOT NULL DEFAULT now();

-- from_location_id / to_location_id / notes already exist from migration
-- 025 with compatible types — nothing to do for those.

-- ── Drop legacy-only columns not present in production's real schema ────────
-- Safe because inventory_movements has zero rows on staging today.

ALTER TABLE inventory_movements DROP COLUMN IF EXISTS item_id;
ALTER TABLE inventory_movements DROP COLUMN IF EXISTS quantity;
ALTER TABLE inventory_movements DROP COLUMN IF EXISTS movement_type;
ALTER TABLE inventory_movements DROP COLUMN IF EXISTS reference;
ALTER TABLE inventory_movements DROP COLUMN IF EXISTS created_by;
ALTER TABLE inventory_movements DROP COLUMN IF EXISTS created_at;

-- ── Indexes matching how the app actually queries this table ────────────────

CREATE INDEX IF NOT EXISTS inventory_movements_piece_idx
  ON inventory_movements (piece_id);

CREATE INDEX IF NOT EXISTS inventory_movements_tenant_idx
  ON inventory_movements (tenant_id);
