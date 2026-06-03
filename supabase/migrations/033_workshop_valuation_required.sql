-- ─────────────────────────────────────────────────────────────────────────────
-- 033: Add valuation_required to workshop_jobs table.
--
-- When a repair or custom-order packet has valuation_required = true,
-- the auto-created workshop job inherits this flag so the board can
-- filter and visually flag jobs that need a valuation.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE workshop_jobs
  ADD COLUMN IF NOT EXISTS valuation_required boolean DEFAULT false;
