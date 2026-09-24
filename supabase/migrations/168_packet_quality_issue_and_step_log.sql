-- 168: quality-issue flag on packets, and activity log for step moves.
--
-- Status changes already log via clear_blocked_on_status_change
-- (072 / 094 / 148). Verified on staging 2026-09-24: a status update
-- inserts event_type status_change. This replaces that function so the
-- same trigger also logs workshop_step_index moves and quality-issue
-- flag changes. Blocked-field clearing on status change is unchanged.
--
-- quality_issue_at null means no open quality issue. A timestamp means
-- the job is flagged. quality_issue_note is optional detail.
-- Each set or clear is a packet_activity_log row (event_type
-- quality_issue) so a later per-person rework count can use the log
-- without another schema change. assigned_to is copied onto that row.
--
-- Number 168: 166 and 167 are workshop roles. Do not reuse them.

ALTER TABLE public.packets
  ADD COLUMN IF NOT EXISTS quality_issue_at timestamptz,
  ADD COLUMN IF NOT EXISTS quality_issue_note text;

COMMENT ON COLUMN public.packets.quality_issue_at IS
  'Set when a quality issue is flagged. Null means no open issue.';
COMMENT ON COLUMN public.packets.quality_issue_note IS
  'Optional note stored with the open quality issue.';

CREATE INDEX IF NOT EXISTS packets_quality_issue_at_idx
  ON public.packets (tenant_id, quality_issue_at)
  WHERE quality_issue_at IS NOT NULL;

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

  IF NEW.quality_issue_at IS DISTINCT FROM OLD.quality_issue_at
     OR NEW.quality_issue_note IS DISTINCT FROM OLD.quality_issue_note THEN
    INSERT INTO public.packet_activity_log (packet_id, tenant_id, event_type, old_value, new_value)
    VALUES (
      NEW.id,
      NEW.tenant_id,
      'quality_issue',
      jsonb_build_object(
        'quality_issue_at', OLD.quality_issue_at,
        'quality_issue_note', OLD.quality_issue_note
      ),
      jsonb_build_object(
        'quality_issue_at', NEW.quality_issue_at,
        'quality_issue_note', NEW.quality_issue_note,
        'assigned_to', NEW.assigned_to
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_blocked_on_status_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_clear_blocked_on_status_change ON public.packets;
CREATE TRIGGER trg_clear_blocked_on_status_change
  BEFORE UPDATE ON public.packets
  FOR EACH ROW EXECUTE FUNCTION public.clear_blocked_on_status_change();
