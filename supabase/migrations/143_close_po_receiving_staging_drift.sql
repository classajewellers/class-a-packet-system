-- 143: close the purchase-orders/receiving staging drift
--
-- STAGING DRIFT FOUND during the 2026-09-22 operational-readiness live-audit
-- (VAULT_BUILD_CHECKLIST.md "Already complete" row: Purchase orders + packet
-- linking). Direct read-only checks against staging found ALL of the
-- following missing entirely:
--   - inventory_purchase_orders   (migration 084)
--   - inventory_po_lines          (migration 084, +086, +087, +090)
--   - inventory_receiving_events  (migration 090)
--   - inventory_pieces.actual_cost, .po_line_id, .receiving_event_id, .quantity
--     (migrations 089, 090 — both depend on the tables above)
--
-- Migration 084's own comment says these two tables "were created directly
-- in production and do not exist in earlier migrations — staging needs them
-- created here" — i.e. 084 already documents this exact gap, but was
-- apparently never applied to vault-staging. Same class of drift as
-- 077/095-113/115/079(→142) found repeatedly this session.
--
-- This migration re-applies 084 + 086 + 087 + 089 + 090's schema changes
-- verbatim, consolidated into one file, in their original order, using the
-- same CREATE TABLE/ADD COLUMN IF NOT EXISTS guards so it's safe to run
-- regardless of which (if any) partial subset staging already has. RLS is
-- enabled with no policies (not disabled) to match the FINAL intended state
-- per migration 093 (092/093 later re-enabled RLS on every inventory table
-- that earlier migrations had disabled it on — server-side app code uses the
-- service-role key, which bypasses RLS regardless, per CLAUDE.md).
--
-- No backfill data exists to migrate — these tables have zero rows on
-- staging today since they never existed to be written to.
--
-- Production was NOT checked as part of this fix. Do not apply to
-- production until a read-only check confirms whether it has the same gap.

-- ── From migration 084: inventory_purchase_orders + inventory_po_lines ──────

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

-- From 084: cost tracking columns
ALTER TABLE inventory_po_lines ADD COLUMN IF NOT EXISTS estimated_cost numeric;
ALTER TABLE inventory_po_lines ADD COLUMN IF NOT EXISTS actual_cost    numeric;

UPDATE inventory_po_lines
SET estimated_cost = unit_cost
WHERE unit_cost IS NOT NULL
  AND estimated_cost IS NULL;

-- From 086: supplier's own reference/job number
ALTER TABLE inventory_po_lines
  ADD COLUMN IF NOT EXISTS supplier_design_no TEXT;

-- From 087: packet linking (Phase 1.2's sibling feature — POs linked to packets)
ALTER TABLE inventory_po_lines
  ADD COLUMN IF NOT EXISTS packet_id UUID REFERENCES packets(id) ON DELETE SET NULL;

-- ── From migration 090: receiving v2 (partial receiving + event history) ────

ALTER TABLE inventory_po_lines
  ADD COLUMN IF NOT EXISTS received_quantity integer NOT NULL DEFAULT 0;

UPDATE inventory_po_lines
  SET received_quantity = quantity
  WHERE received = true
    AND received_quantity = 0;

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

CREATE INDEX IF NOT EXISTS inventory_receiving_events_tenant_idx
  ON inventory_receiving_events (tenant_id);

CREATE INDEX IF NOT EXISTS inventory_receiving_events_po_line_idx
  ON inventory_receiving_events (po_line_id);

CREATE INDEX IF NOT EXISTS inventory_receiving_events_po_idx
  ON inventory_receiving_events (po_id);

-- From 090: inventory_pieces gains po_line_id / receiving_event_id / quantity
ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS po_line_id uuid
    REFERENCES inventory_po_lines(id) ON DELETE SET NULL;

ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS receiving_event_id uuid
    REFERENCES inventory_receiving_events(id) ON DELETE SET NULL;

ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

UPDATE inventory_pieces ip
  SET po_line_id = pol.id
  FROM inventory_po_lines pol
  WHERE pol.piece_id = ip.id
    AND ip.po_line_id IS NULL;

CREATE INDEX IF NOT EXISTS inventory_pieces_po_line_idx
  ON inventory_pieces (po_line_id);

CREATE INDEX IF NOT EXISTS inventory_pieces_receiving_event_idx
  ON inventory_pieces (receiving_event_id);

-- ── From migration 089: inventory_pieces.actual_cost ─────────────────────────
-- (used for gross-profit calcs on sale — distinct from inventory_po_lines.actual_cost,
-- which is the per-line invoiced amount)

ALTER TABLE inventory_pieces ADD COLUMN IF NOT EXISTS actual_cost numeric;

-- ── RLS: match the FINAL state from migrations 092/093 (enabled, no policies) ─
-- Not "DISABLE ROW LEVEL SECURITY" as 084/090 originally had it — 093
-- superseded that for these exact tables. Service-role app code is
-- unaffected either way (RLS never applies to the service role).

ALTER TABLE inventory_purchase_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_po_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_receiving_events ENABLE ROW LEVEL SECURITY;
