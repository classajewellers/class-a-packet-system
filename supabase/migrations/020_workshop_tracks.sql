-- ── Migration 020: Workshop track routing + new stage names ──────────────────

-- 1. Add track column (default: repair, to match existing jobs)
ALTER TABLE workshop_jobs
  ADD COLUMN IF NOT EXISTS track text DEFAULT 'repair';

-- 2. Migrate existing jobs to the correct track based on job_type
UPDATE workshop_jobs SET track = 'manufacturing' WHERE job_type = 'custom_order';
UPDATE workshop_jobs SET track = 'collections'   WHERE job_type = 'collections';
UPDATE workshop_jobs SET track = 'repair'        WHERE job_type NOT IN ('custom_order', 'collections');

-- 3. WSJB QC pre-check checklist fields (manufacturing track)
ALTER TABLE workshop_jobs
  ADD COLUMN IF NOT EXISTS wsjb_precheck_complete      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS wsjb_subcontractor_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS wsjb_subcontractor_name     text,
  ADD COLUMN IF NOT EXISTS wsjb_ready_for_jeweller     boolean DEFAULT false;

-- 4. Migrate existing stage names to new stage names
--    Old "new" → "sr_job_drawer"
UPDATE workshop_jobs SET stage = 'sr_job_drawer'  WHERE stage = 'new';
--    Old "precheck" → "ws_precheck"
UPDATE workshop_jobs SET stage = 'ws_precheck'     WHERE stage = 'precheck';
--    Old "in_progress" → "jeweller" (closest equivalent)
UPDATE workshop_jobs SET stage = 'jeweller'        WHERE stage = 'in_progress';
--    Old "cad" → "designs"
UPDATE workshop_jobs SET stage = 'designs'         WHERE stage = 'cad';
--    Old "cadbox" → "order_box"
UPDATE workshop_jobs SET stage = 'order_box'       WHERE stage = 'cadbox';
--    Old "collection" → "ws_job_box"
UPDATE workshop_jobs SET stage = 'ws_job_box'      WHERE stage = 'collection';
--    Old "manufacturing" → "ws_job_box" (already at production, map to job box)
UPDATE workshop_jobs SET stage = 'ws_job_box'      WHERE stage = 'manufacturing';
--    Old "ready" → "qc"
UPDATE workshop_jobs SET stage = 'qc'              WHERE stage = 'ready';

-- 5. Drop existing status check constraint (may not exist in all envs)
ALTER TABLE workshop_jobs
  DROP CONSTRAINT IF EXISTS workshop_jobs_status_check;

-- 6. Add updated constraint with all new stage names
ALTER TABLE workshop_jobs
  ADD CONSTRAINT workshop_jobs_status_check CHECK (status IN (
    'sr_job_drawer', 'ws_precheck', 'ws_manager_precheck',
    'admin_populate_pkt', 'ws_job_box', 'designs',
    'send_file_order_parts', 'order_box', 'wsjb_qc_precheck',
    'jeweller', 'qc', 'value', 'marketing_value', 'fjb', 'completed'
  ));

-- NOTE: The `status` column in the constraint above refers to what the ORM
-- calls `stage` in the application layer. If the physical column is named
-- `stage` (not `status`), replace `status` with `stage` below:
ALTER TABLE workshop_jobs
  DROP CONSTRAINT IF EXISTS workshop_jobs_status_check;

ALTER TABLE workshop_jobs
  ADD CONSTRAINT workshop_jobs_stage_check CHECK (stage IN (
    'sr_job_drawer', 'ws_precheck', 'ws_manager_precheck',
    'admin_populate_pkt', 'ws_job_box', 'designs',
    'send_file_order_parts', 'order_box', 'wsjb_qc_precheck',
    'jeweller', 'qc', 'value', 'marketing_value', 'fjb', 'completed'
  ));

-- 7. Add check constraint on track column
ALTER TABLE workshop_jobs
  DROP CONSTRAINT IF EXISTS workshop_jobs_track_check;

ALTER TABLE workshop_jobs
  ADD CONSTRAINT workshop_jobs_track_check
  CHECK (track IN ('repair', 'collections', 'manufacturing'));
