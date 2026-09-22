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
-- THIS IS NOT STAGING DRIFT in the schema sense, but the VALUES below are
-- real — Josh confirmed production already has this column, fully
-- populated, and provided the exact real values directly (not a guess,
-- not invented). This migration is STAGING-ONLY: production already has
-- the column and correct values, so this must never be applied there.
--
--   In stock               #10B981
--   Reserved                #F59E0B
--   Sold                     #6B7280
--   On memo                  #3B82F6
--   Staff wear                #8B5CF6
--   In production              #F97316
--   In repair                   #EF4444
--   Awaiting photography          #F59E0B
--   Awaiting valuation             #F59E0B
--   Awaiting pricing                #F59E0B
--   Ready for collection             #10B981
--   Missing / discrepancy             #DC2626

ALTER TABLE inventory_statuses
  ADD COLUMN IF NOT EXISTS colour text;

UPDATE inventory_statuses SET colour = '#10B981' WHERE name = 'In stock'              AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#F59E0B' WHERE name = 'Reserved'              AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#6B7280' WHERE name = 'Sold'                  AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#3B82F6' WHERE name = 'On memo'               AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#8B5CF6' WHERE name = 'Staff wear'            AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#F97316' WHERE name = 'In production'         AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#EF4444' WHERE name = 'In repair'             AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#F59E0B' WHERE name = 'Awaiting photography'  AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#F59E0B' WHERE name = 'Awaiting valuation'    AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#F59E0B' WHERE name = 'Awaiting pricing'      AND colour IS NULL;
UPDATE inventory_statuses SET colour = '#10B981' WHERE name = 'Ready for collection'  AND colour IS NULL;
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
