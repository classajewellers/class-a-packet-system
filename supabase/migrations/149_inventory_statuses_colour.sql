-- 149: add colour to inventory_statuses (genuine missing feature, not drift)
--
-- Confirmed by Josh (2026-09-22): inventory_statuses SHOULD have a colour
-- column — it's read by app/inventory/page.tsx, app/inventory/[id]/page.tsx,
-- and app/inventory/products/[id]/page.tsx to render status badges
-- (`status.colour`, used as a hex string with alpha-suffix tricks like
-- `colour + "22"` for the badge background). Found missing while verifying
-- the Critical tenant-isolation batch — the movements route's embedded
-- `inventory_statuses!from_status_id(id,name,colour)` select failed on
-- staging with "column ... colour does not exist".
--
-- THIS IS NOT STAGING DRIFT — pending confirmation from Josh on whether
-- production has this column already. If production already has real
-- colour values, this migration's DEFAULT values below should be replaced
-- with the real ones before running, the same way inventory_statuses'
-- rows themselves were sourced from a real production column listing
-- rather than invented (see migration 145). If production is missing it
-- too, this is a genuine new feature — do not apply to production without
-- Josh's explicit sign-off separately from staging.
--
-- Default colours below are proposed, not final — flagged for Josh to
-- adjust. Picked to read clearly against both light backgrounds (used
-- directly as text colour) and their own 13%/27% alpha tints (background/
-- border, via the `colour + "22"`/`"44"` suffix pattern already in the
-- frontend) without relying on any existing design-system token, since
-- this table's colour is per-row data, not a shared CSS class.
--
--   In stock              #16A34A  green   — the "good" default state
--   Reserved               #2563EB  blue    — spoken for, not yet resolved
--   Sold                    #6B7280  grey    — final, past-tense state
--   On memo                 #7C3AED  violet  — outside normal stock flow
--   Staff wear               #DB2777  pink    — distinct from all workflow states
--   In production            #EA580C  orange  — active make/build work
--   In repair                 #D97706  amber   — active work, warmer than "in production"
--   Awaiting photography       #0891B2  cyan    — a queued/waiting sub-state
--   Awaiting valuation          #0891B2  cyan    — same "queued" family as photography
--   Awaiting pricing              #0891B2  cyan    — same "queued" family
--   Ready for collection           #16A34A  green   — positive/complete, same family as In stock
--   Missing / discrepancy            #DC2626  red     — the one status that needs attention

ALTER TABLE inventory_statuses
  ADD COLUMN IF NOT EXISTS colour text;

UPDATE inventory_statuses SET colour = '#16A34A' WHERE name = 'In stock'              AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#2563EB' WHERE name = 'Reserved'              AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#6B7280' WHERE name = 'Sold'                  AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#7C3AED' WHERE name = 'On memo'               AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#DB2777' WHERE name = 'Staff wear'            AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#EA580C' WHERE name = 'In production'         AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#D97706' WHERE name = 'In repair'             AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#0891B2' WHERE name = 'Awaiting photography'  AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#0891B2' WHERE name = 'Awaiting valuation'    AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#0891B2' WHERE name = 'Awaiting pricing'      AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#16A34A' WHERE name = 'Ready for collection'  AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#DC2626' WHERE name = 'Missing / discrepancy' AND colour IS NULL;

-- Anything not covered above (a status Josh adds later, or one whose name
-- doesn't exactly match the list) falls back to the same neutral grey
-- already used as the frontend's own fallback
-- (app/inventory/[id]/page.tsx: `piece.status?.colour ?? "#9CA3AF"`) rather
-- than being left NULL — a badge that renders is better than one that
-- silently breaks the "22"/"44" alpha-suffix string concatenation on null.
UPDATE inventory_statuses SET colour = '#9CA3AF' WHERE colour IS NULL;

ALTER TABLE inventory_statuses
  ALTER COLUMN colour SET DEFAULT '#9CA3AF';
