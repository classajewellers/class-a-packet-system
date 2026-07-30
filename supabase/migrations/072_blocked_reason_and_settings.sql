-- 072_blocked_reason_and_settings.sql
-- Adds blocked-reason fields to packets, workshop_settings table,
-- and a minimal packet_activity_log for audit history.

-- ── 1. Blocked fields on packets ──────────────────────────────────────────────

ALTER TABLE packets ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
  -- NULL | 'waiting_customer' | 'waiting_supplier' | 'waiting_materials'
  -- | 'waiting_stone' | 'waiting_casting' | 'waiting_approval'
  -- | 'waiting_subcontractor' | 'other'
ALTER TABLE packets ADD COLUMN IF NOT EXISTS blocked_note TEXT;
  -- free-text detail; only meaningful when blocked_reason = 'other'
ALTER TABLE packets ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

-- ── 2. Workshop settings (per-tenant config) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS workshop_settings (
  tenant_id             UUID    PRIMARY KEY,
  stale_threshold_days  INT     DEFAULT 5,
  valuation_threshold   NUMERIC DEFAULT 3000
);
ALTER TABLE workshop_settings DISABLE ROW LEVEL SECURITY;

INSERT INTO workshop_settings (tenant_id, stale_threshold_days, valuation_threshold)
VALUES ('00000000-0000-0000-0000-000000000001', 5, 3000)
ON CONFLICT DO NOTHING;

-- ── 3. Packet activity log ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS packet_activity_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id    UUID        NOT NULL REFERENCES packets(id) ON DELETE CASCADE,
  tenant_id    UUID        NOT NULL,
  event_type   TEXT        NOT NULL, -- 'status_change' | 'blocked_cleared' | ...
  old_value    JSONB,
  new_value    JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE packet_activity_log DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS packet_activity_log_packet_idx ON packet_activity_log (packet_id, created_at DESC);

-- ── 4. Trigger: clear blocked fields on status change ─────────────────────────

CREATE OR REPLACE FUNCTION clear_blocked_on_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only act when status actually changes
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Log the prior blocked state if there was one
    IF OLD.blocked_reason IS NOT NULL THEN
      INSERT INTO packet_activity_log (packet_id, tenant_id, event_type, old_value, new_value)
      VALUES (
        OLD.id,
        OLD.tenant_id,
        'blocked_cleared',
        jsonb_build_object(
          'blocked_reason', OLD.blocked_reason,
          'blocked_note',   OLD.blocked_note,
          'blocked_at',     OLD.blocked_at,
          'status',         OLD.status
        ),
        jsonb_build_object('status', NEW.status)
      );
    END IF;

    -- Log the status change itself
    INSERT INTO packet_activity_log (packet_id, tenant_id, event_type, old_value, new_value)
    VALUES (
      NEW.id,
      NEW.tenant_id,
      'status_change',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );

    -- Clear blocked fields
    NEW.blocked_reason := NULL;
    NEW.blocked_note   := NULL;
    NEW.blocked_at     := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_blocked_on_status_change ON packets;
CREATE TRIGGER trg_clear_blocked_on_status_change
  BEFORE UPDATE ON packets
  FOR EACH ROW EXECUTE FUNCTION clear_blocked_on_status_change();
