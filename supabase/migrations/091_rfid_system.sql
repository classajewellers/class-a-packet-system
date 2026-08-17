-- 091_rfid_system.sql
--
-- Full RFID system:
--   1. rfid_printers          — logical printer config (Vault-side, user-visible)
--   2. rfid_bridge_installations — one record per physical bridge deployment + auth
--   3. Extend print_jobs      — proper state machine, full audit fields
--   4. inventory_rfid_tags    — one record per physical tag ever issued
--   5. inventory_pieces.barcode — visible barcode column
--
-- Design notes:
--   - tenant_rfid_connections (079) is superseded by rfid_bridge_installations.
--     Table is left in place to avoid breakage but is no longer used by new code.
--   - One active RFID tag per piece enforced via partial unique index.
--   - Bridge credentials: api_key_hash stores SHA-256(api_key) so the raw key
--     never touches the database.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rfid_printers — one record per physical Zebra printer
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rfid_printers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name   text        NOT NULL,
  model          text        NOT NULL DEFAULT 'Zebra ZD621R',
  capability     text        NOT NULL DEFAULT 'rfid',  -- 'rfid' | 'label_only'
  location_id    uuid        REFERENCES inventory_locations(id) ON DELETE SET NULL,
  is_active      boolean     NOT NULL DEFAULT true,
  last_seen_at   timestamptz,
  last_print_at  timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);

ALTER TABLE rfid_printers DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS rfid_printers_tenant_idx ON rfid_printers (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rfid_bridge_installations — one per physical bridge PC/service
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rfid_bridge_installations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name        text        NOT NULL,
  api_key_hash        text        NOT NULL UNIQUE, -- SHA-256(raw_key) stored as hex
  printer_id          uuid        REFERENCES rfid_printers(id) ON DELETE SET NULL,
  is_active           boolean     NOT NULL DEFAULT true,
  last_heartbeat_at   timestamptz,
  last_error          text,
  bridge_version      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz
);

ALTER TABLE rfid_bridge_installations DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS rfid_bridge_installations_tenant_idx
  ON rfid_bridge_installations (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Extend print_jobs to a proper state machine
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old minimal constraint so we can replace it
ALTER TABLE print_jobs DROP CONSTRAINT IF EXISTS print_jobs_status_check;

-- Migrate legacy status values before adding new constraint
UPDATE print_jobs SET status = 'completed' WHERE status = 'printed';
UPDATE print_jobs SET status = 'queued'    WHERE status = 'pending';

-- New columns
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS rfid_tag_id      uuid;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS printer_id        uuid REFERENCES rfid_printers(id) ON DELETE SET NULL;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS installation_id   uuid REFERENCES rfid_bridge_installations(id) ON DELETE SET NULL;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS requested_by      uuid  REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS requested_at      timestamptz NOT NULL DEFAULT now();
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS claimed_at        timestamptz;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS started_at        timestamptz;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS completed_at      timestamptz;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS failed_at         timestamptz;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS retry_count       integer NOT NULL DEFAULT 0;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS last_error        text;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS label_data        jsonb;       -- structured data for template
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS label_template    text NOT NULL DEFAULT 'jewellery_v1';
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS idempotency_key   text;

ALTER TABLE print_jobs ALTER COLUMN status SET DEFAULT 'queued';

ALTER TABLE print_jobs ADD CONSTRAINT print_jobs_status_check
  CHECK (status IN ('queued','claimed','printing','completed','failed','cancelled'));

-- Idempotency: prevent duplicate active jobs for the same key
CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_idempotency_active_idx
  ON print_jobs (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status NOT IN ('failed','cancelled','completed');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. inventory_rfid_tags — one record per physical RFID tag ever issued
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_rfid_tags (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_piece_id    uuid        NOT NULL REFERENCES inventory_pieces(id) ON DELETE RESTRICT,
  epc                   text        NOT NULL,  -- 24-char hex, 96-bit UHF EPC
  status                text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending',   -- EPC assigned, print job queued (not yet on physical tag)
                            'printed',   -- ZPL sent to printer; tag *may* be encoded (unverified)
                            'active',    -- physically verified: tag read, EPC confirmed correct
                            'replaced',  -- superseded by a newer active tag
                            'damaged',   -- print failed / tag unreadable
                            'retired'    -- manually retired
                          )),
  print_job_id          uuid        REFERENCES print_jobs(id) ON DELETE SET NULL,
  assigned_at           timestamptz,
  assigned_by           uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  activated_at          timestamptz,  -- set when bridge confirms successful encode
  retired_at            timestamptz,
  retired_by            uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  retirement_reason     text,
  last_seen_at          timestamptz,
  last_seen_location_id uuid        REFERENCES inventory_locations(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz,
  CONSTRAINT inventory_rfid_tags_epc_tenant_unique UNIQUE (tenant_id, epc)
);

ALTER TABLE inventory_rfid_tags DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS inventory_rfid_tags_tenant_idx  ON inventory_rfid_tags (tenant_id);
CREATE INDEX IF NOT EXISTS inventory_rfid_tags_piece_idx   ON inventory_rfid_tags (inventory_piece_id);
CREATE INDEX IF NOT EXISTS inventory_rfid_tags_epc_idx     ON inventory_rfid_tags (tenant_id, epc);
CREATE INDEX IF NOT EXISTS inventory_rfid_tags_status_idx  ON inventory_rfid_tags (tenant_id, status);

-- Critical: only one active tag per piece per tenant
CREATE UNIQUE INDEX IF NOT EXISTS inventory_rfid_tags_one_active_per_piece
  ON inventory_rfid_tags (tenant_id, inventory_piece_id)
  WHERE status = 'active';

-- Wire print_jobs.rfid_tag_id FK now that inventory_rfid_tags exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'print_jobs_rfid_tag_fk'
      AND table_name = 'print_jobs'
  ) THEN
    ALTER TABLE print_jobs
      ADD CONSTRAINT print_jobs_rfid_tag_fk
      FOREIGN KEY (rfid_tag_id)
      REFERENCES inventory_rfid_tags(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. inventory_pieces — barcode column (same value as SKU for now, but decoupled)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS barcode text;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_pieces_barcode_tenant_idx
  ON inventory_pieces (tenant_id, barcode)
  WHERE barcode IS NOT NULL;
