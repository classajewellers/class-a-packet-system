-- 091_rfid_system.sql
--
-- Full RFID system:
--   1. rfid_printers             — logical printer config (Vault-side, user-visible)
--   2. rfid_bridge_installations — one record per physical bridge deployment + auth
--   3. Extend print_jobs         — proper state machine, full audit fields
--   4. inventory_rfid_tags       — one record per physical tag ever issued
--   5. inventory_pieces.barcode  — visible barcode column
--   6. vault_verify_rfid_tag()   — atomic verification stored procedure
--
-- Design notes:
--   - tenant_rfid_connections (079) is superseded by rfid_bridge_installations.
--     Table is left in place to avoid breakage but is no longer used by new code.
--   - Database-level uniqueness enforced for every meaningful tag/job state:
--       ONE active tag per piece (WHERE status = 'active')
--       ONE unresolved tag per piece (WHERE status IN ('pending','printed'))
--       ONE in-flight job per piece (WHERE status IN ('queued','claimed','printing'))
--   - Verification is atomic via vault_verify_rfid_tag() which uses SELECT FOR
--     UPDATE to prevent concurrent verification races.
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
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS label_data        jsonb;
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS label_template    text NOT NULL DEFAULT 'jewellery_v1';
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS idempotency_key   text;

ALTER TABLE print_jobs ALTER COLUMN status SET DEFAULT 'queued';

ALTER TABLE print_jobs ADD CONSTRAINT print_jobs_status_check
  CHECK (status IN ('queued','claimed','printing','completed','failed','cancelled'));

-- Prevent duplicate active jobs per idempotency key
CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_idempotency_active_idx
  ON print_jobs (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status NOT IN ('failed','cancelled','completed');

-- DATABASE-LEVEL: at most one in-flight print job per piece
-- Concurrent requests that pass the application guard will hit this constraint
-- and receive a unique-violation error, returned to the UI as 409.
CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_one_inflight_per_piece
  ON print_jobs (tenant_id, piece_id)
  WHERE status IN ('queued','claimed','printing');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. inventory_rfid_tags — one record per physical RFID tag ever issued
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_rfid_tags (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_piece_id    uuid        NOT NULL REFERENCES inventory_pieces(id) ON DELETE RESTRICT,
  epc                   text        NOT NULL,  -- 24-char hex, 96-bit UHF EPC Gen2
  status                text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending',  -- EPC assigned, print job queued; not yet on a physical tag
                            'printed',  -- ZPL transmitted to printer; tag may be encoded (UNVERIFIED)
                            'active',   -- physically verified: UHF reader confirmed correct EPC
                            'replaced', -- superseded by a newer verified active tag
                            'damaged',  -- TCP send failed or tag confirmed unreadable
                            'retired'   -- manually retired
                          )),

  -- Print tracking
  print_job_id          uuid        REFERENCES print_jobs(id) ON DELETE SET NULL,
  assigned_at           timestamptz,
  assigned_by           uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  activated_at          timestamptz, -- set when tag reaches 'active' (after physical verification)

  -- Verification fields — populated only when status = 'active'
  -- verification_method: 'uhf_reader_manual' | 'azh_p1' | 'uhf_reader_api'
  verified_at           timestamptz,
  verified_by           uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  verification_method   text,        -- which reader/method confirmed the EPC
  verified_device_id    text,        -- device serial/ID (e.g. AZH-P1 unit ID) when available

  -- Retirement fields
  retired_at            timestamptz,
  retired_by            uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  retirement_reason     text,

  -- Scan tracking (updated by handheld stocktake, future)
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

-- DATABASE-LEVEL: at most one verified/active tag per piece
CREATE UNIQUE INDEX IF NOT EXISTS inventory_rfid_tags_one_active_per_piece
  ON inventory_rfid_tags (tenant_id, inventory_piece_id)
  WHERE status = 'active';

-- DATABASE-LEVEL: at most one unresolved (pending/printed) tag per piece
-- Any application-layer race that passes the SELECT guards will hit this on INSERT
-- and receive a unique constraint violation, handled as 409 by the API route.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_rfid_tags_one_unresolved_per_piece
  ON inventory_rfid_tags (tenant_id, inventory_piece_id)
  WHERE status IN ('pending', 'printed');

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
-- 5. inventory_pieces — barcode column
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS barcode text;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_pieces_barcode_tenant_idx
  ON inventory_pieces (tenant_id, barcode)
  WHERE barcode IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. vault_verify_rfid_tag() — atomic RFID tag verification
--
-- Called by POST /api/rfid/pieces/[id]/verify after the user has physically
-- read the tag with a UHF EPC Gen2 reader and supplied the observed EPC.
--
-- Atomically within one transaction:
--   a) Lock the printed tag and verify the confirmed EPC matches exactly
--   b) Lock and retire any existing active tag for this piece
--   c) Activate the verified tag with full audit fields
--
-- Returns JSONB: { ok: bool, error?: text, code?: text, ... }
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION vault_verify_rfid_tag(
  p_tenant_id           uuid,
  p_tag_id              uuid,
  p_confirmed_epc       text,
  p_verified_by         uuid,
  p_verification_method text,
  p_device_id           text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_tag             inventory_rfid_tags%ROWTYPE;
  v_existing_active inventory_rfid_tags%ROWTYPE;
  v_now             timestamptz := now();
BEGIN
  -- Lock the tag we intend to verify. FOR UPDATE prevents a concurrent call
  -- from verifying the same tag simultaneously.
  SELECT * INTO v_tag
  FROM inventory_rfid_tags
  WHERE id = p_tag_id
    AND tenant_id = p_tenant_id
    AND status = 'printed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'Tag not found or not in printed state',
      'code',  'not_found'
    );
  END IF;

  -- EPC must match exactly. Comparison is case-insensitive hex.
  IF lower(v_tag.epc) <> lower(p_confirmed_epc) THEN
    RETURN jsonb_build_object(
      'ok',            false,
      'error',         'EPC mismatch — the EPC read from the physical tag does not match what Vault encoded',
      'code',          'epc_mismatch',
      'expected_epc',  v_tag.epc,
      'confirmed_epc', lower(p_confirmed_epc)
    );
  END IF;

  -- Lock and retire any existing active tag for this piece (replacement case).
  -- Done before activating the new tag so the unique index (status='active')
  -- is never violated.
  SELECT * INTO v_existing_active
  FROM inventory_rfid_tags
  WHERE inventory_piece_id = v_tag.inventory_piece_id
    AND tenant_id = p_tenant_id
    AND status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    UPDATE inventory_rfid_tags
    SET
      status            = 'replaced',
      retired_at        = v_now,
      retirement_reason = 'replaced_by_verified_tag'
    WHERE id = v_existing_active.id;
  END IF;

  -- Activate the newly verified tag with full audit trail.
  UPDATE inventory_rfid_tags
  SET
    status               = 'active',
    activated_at         = v_now,
    verified_at          = v_now,
    verified_by          = p_verified_by,
    verification_method  = p_verification_method,
    verified_device_id   = p_device_id
  WHERE id = p_tag_id;

  RETURN jsonb_build_object(
    'ok',               true,
    'tag_id',           p_tag_id,
    'epc',              v_tag.epc,
    'activated_at',     v_now,
    'retired_previous', v_existing_active.id IS NOT NULL
  );
END;
$$;
