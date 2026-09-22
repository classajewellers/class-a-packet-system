-- 148: close the packet_activity_log / workshop_settings staging drift
--
-- STAGING DRIFT FOUND during the 2026-09-22 tenant-isolation remediation
-- (Critical batch verification, app/api/workshop/packets/[id]/activity/route.ts).
-- Unlike inventory_statuses/inventory_categories/inventory_movements, this
-- one DOES have a real migration source — 072_blocked_reason_and_settings.sql
-- — but it was apparently never applied to staging at all: direct checks
-- confirmed packets.blocked_reason, workshop_settings, and
-- packet_activity_log are ALL missing from staging. Same class of drift as
-- everything else found this session (partial or total non-application of
-- a real migration), just a different migration.
--
-- Re-applies 072 verbatim (already fully idempotent — IF NOT EXISTS /
-- CREATE OR REPLACE / DROP TRIGGER IF EXISTS / ON CONFLICT DO NOTHING
-- throughout), with one change: the trigger function is defined directly
-- in its FINAL hardened form from migration 094_function_security.sql
-- (adds `SET search_path = public`, a security fix superseding 072's
-- original definition) rather than defining the vulnerable version first
-- only to replace it — no reason to recreate a security gap that's
-- already been closed in a later migration.
--
-- Production already has all of this (confirmed by Josh providing the
-- packets/workshop_settings/packet_activity_log schema directly) — this
-- migration is staging-only by construction.

-- ── 1. Blocked fields on packets ──────────────────────────────────────────────

ALTER TABLE packets ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS blocked_note TEXT;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

-- ── 2. Workshop settings (per-tenant config) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS workshop_settings (
  tenant_id             UUID    PRIMARY KEY,
  stale_threshold_days  INT     DEFAULT 5,
  valuation_threshold   NUMERIC DEFAULT 3000
);
ALTER TABLE workshop_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO workshop_settings (tenant_id, stale_threshold_days, valuation_threshold)
VALUES ('00000000-0000-0000-0000-000000000001', 5, 3000)
ON CONFLICT DO NOTHING;

-- ── 3. Packet activity log ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS packet_activity_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id    UUID        NOT NULL REFERENCES packets(id) ON DELETE CASCADE,
  tenant_id    UUID        NOT NULL,
  event_type   TEXT        NOT NULL,
  old_value    JSONB,
  new_value    JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE packet_activity_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS packet_activity_log_packet_idx ON packet_activity_log (packet_id, created_at DESC);

-- ── 4. Trigger: clear blocked fields on status change (final hardened form) ──

CREATE OR REPLACE FUNCTION public.clear_blocked_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.blocked_reason IS NOT NULL THEN
      INSERT INTO public.packet_activity_log (packet_id, tenant_id, event_type, old_value, new_value)
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
    INSERT INTO public.packet_activity_log (packet_id, tenant_id, event_type, old_value, new_value)
    VALUES (
      NEW.id,
      NEW.tenant_id,
      'status_change',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
    NEW.blocked_reason := NULL;
    NEW.blocked_note   := NULL;
    NEW.blocked_at     := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_blocked_on_status_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_clear_blocked_on_status_change ON packets;
CREATE TRIGGER trg_clear_blocked_on_status_change
  BEFORE UPDATE ON packets
  FOR EACH ROW EXECUTE FUNCTION clear_blocked_on_status_change();
