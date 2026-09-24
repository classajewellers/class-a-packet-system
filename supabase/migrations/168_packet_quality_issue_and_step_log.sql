-- 168: one quality-issue flag, and activity log for step moves.
--
-- Does not add packets.assigned_to. That uuid already references profiles.id.
-- Does not add CAD or casting columns.
--
-- Choice: one boolean on packets, not a packet_quality_issues table and not
-- a second note/timestamp column. History of the flag is a packet_activity_log
-- row (event_type quality_issue), which Part F can count. assigned_to is
-- copied onto that row.
--
-- Status changes already log via clear_blocked_on_status_change
-- (072 / 094 / 148). Checked on staging 2026-09-24: a status update inserts
-- event_type status_change. This replaces that function so the same trigger
-- also logs workshop_step_index moves and quality_issue flips. Blocked-field
-- clearing on status change is unchanged.
--
-- A draft of this file added quality_issue_at and quality_issue_note.
-- Those are not the lock. Drop them if present.
--
-- Number 168: 167 is taken. Do not reuse it.
-- HOLD: do not apply until the tip is marked READY.

ALTER TABLE public.packets
  ADD COLUMN IF NOT EXISTS quality_issue boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.packets.quality_issue IS
  'True when this job has an open rework/quality issue. False means no open issue.';

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

  IF NEW.workshop_step_index IS DISTINCT FROM OLD.workshop_step_index THEN
    INSERT INTO public.packet_activity_log (packet_id, tenant_id, event_type, old_value, new_value)
    VALUES (
      NEW.id,
      NEW.tenant_id,
      'step_change',
      jsonb_build_object('step_index', OLD.workshop_step_index),
      jsonb_build_object('step_index', NEW.workshop_step_index)
    );
  END IF;

  IF NEW.quality_issue IS DISTINCT FROM OLD.quality_issue THEN
    INSERT INTO public.packet_activity_log (packet_id, tenant_id, event_type, old_value, new_value)
    VALUES (
      NEW.id,
      NEW.tenant_id,
      'quality_issue',
      jsonb_build_object('quality_issue', OLD.quality_issue),
      jsonb_build_object(
        'quality_issue', NEW.quality_issue,
        'assigned_to', NEW.assigned_to
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_blocked_on_status_change() FROM anon, authenticated;

DROP INDEX IF EXISTS public.packets_quality_issue_at_idx;
ALTER TABLE public.packets DROP COLUMN IF EXISTS quality_issue_at;
ALTER TABLE public.packets DROP COLUMN IF EXISTS quality_issue_note;

DROP TRIGGER IF EXISTS trg_clear_blocked_on_status_change ON public.packets;
CREATE TRIGGER trg_clear_blocked_on_status_change
  BEFORE UPDATE ON public.packets
  FOR EACH ROW EXECUTE FUNCTION public.clear_blocked_on_status_change();
