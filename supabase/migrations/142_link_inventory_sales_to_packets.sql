-- 142: close the 079 staging drift (inventory_sales + RFID connection
-- tables), then link inventory_sales to packets (Phase 1.2)
--
-- STAGING DRIFT FOUND while applying this migration: migration 079 created
-- 5 tables together (inventory_products, inventory_sales,
-- tenant_rfid_connections, tenant_rfid_handhelds, print_jobs). Direct
-- read-only check against staging (2026-09-22) found only 2 of the 5
-- actually present — inventory_products and print_jobs exist;
-- inventory_sales, tenant_rfid_connections, and tenant_rfid_handhelds do
-- NOT exist on staging at all. Same class of partial-migration-application
-- drift found repeatedly this session (077, 095/096/109/111/113, 115) —
-- 079 was evidently never fully applied to vault-staging, only partially.
--
-- NOTE FOR JOSH: tenant_rfid_connections/tenant_rfid_handhelds missing from
-- staging means the RFID feature (marked COMPLETE in VAULT_BUILD_CHECKLIST.md
-- based on a codebase audit, not a live staging check) cannot actually work
-- end-to-end on staging today. Re-created here since it's the same source
-- migration and the same drift pattern, but flagging explicitly — this
-- wasn't the thing I went looking for, I found it while fixing 142.
--
-- Re-applying 079's table definitions verbatim (CREATE TABLE IF NOT EXISTS —
-- already idempotent, safe to run regardless of which subset is present) for
-- the three missing tables only. inventory_products and print_jobs are
-- deliberately NOT repeated here since they're already confirmed present and
-- unchanged — no need to touch them.
--
-- Production was NOT checked as part of this fix — this migration must not
-- be applied to production until Josh (or a read-only check) confirms
-- whether production has the same gap or already has all 5 tables from 079.

-- ── From migration 079: inventory_sales ──────────────────────────────────────

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

-- ── From migration 079: tenant_rfid_connections ──────────────────────────────

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

-- ── From migration 079: tenant_rfid_handhelds ────────────────────────────────

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

-- ── Phase 1.2 (VAULT_BUILD_CHECKLIST.md): link inventory_sales to packets ────
--
-- Confirmed by direct code search: inventory_sales has exactly one writer
-- (app/api/inventory/sales/route.ts, the "Mark as Sold" flow) and zero other
-- readers anywhere in the codebase — no report, dashboard, or other route
-- depends on its current disconnected shape. Safe to extend in place, no
-- backfill needed for existing rows (packet_id stays NULL for sales recorded
-- before this migration — though on staging there are none yet, since the
-- table didn't exist until this migration runs).
--
-- Going forward, "Mark as Sold" also creates a packets row (packet_type =
-- 'stock_sale') via the same createPacket() used by every other order path,
-- so stock sales become visible to Reports, customer history, and staff
-- performance instead of being a disconnected ledger. inventory_sales
-- remains the source of truth for sale-specific detail (discount_amount,
-- payment_method) — packets.total_charges holds the GROSS sold price per
-- Josh's instruction (2026-09-22): net is computed as
-- packets.total_charges - inventory_sales.discount_amount, never collapsed
-- into a single stored number.

ALTER TABLE inventory_sales
  ADD COLUMN IF NOT EXISTS packet_id uuid REFERENCES packets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_sales_packet_idx
  ON inventory_sales (packet_id);
