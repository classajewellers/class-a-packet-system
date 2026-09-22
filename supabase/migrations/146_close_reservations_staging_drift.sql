-- 146: close the inventory_reservations staging drift
--
-- STAGING DRIFT FOUND during the 2026-09-22 operational-readiness live-audit
-- (VAULT_BUILD_CHECKLIST.md "Already complete" row: Stock reservations).
-- Direct read-only check found inventory_reservations missing from staging
-- entirely — migration 081 was apparently never applied there. Used by the
-- Mark-as-Sold reservation-conflict check (app/api/inventory/sales/route.ts,
-- Phase 1.2) and app/inventory/[id]/page.tsx.
--
-- This table depends on inventory_statuses (previous_status_id) and
-- inventory_sales (converted_sale_id) — both were themselves found missing
-- from staging earlier this session and are closed by migrations 144 and
-- 142 respectively. Run 144 and 142 before this one.
--
-- Re-applying 081 verbatim (CREATE TABLE IF NOT EXISTS — already
-- idempotent). RLS is enabled (not disabled, as 081 originally had it) to
-- match the final state from migration 093, which re-enabled RLS on this
-- exact table — server-side app code uses the service-role key, which
-- bypasses RLS regardless (per CLAUDE.md), so this has no functional effect
-- on the app, only on direct non-service-role access via PostgREST.
--
-- Production was NOT checked. Do not apply to production until a read-only
-- check confirms whether it has the same gap.

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

ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;

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
