-- ─────────────────────────────────────────────────────────────────────────────
-- 108: Add charm_price + soldering_fee to charm_aftermarket_rates and
--      convert total_price to a generated column.
--
-- Migration 107 already ran in production and created charm_aftermarket_rates
-- with only a total_price column (seeded with 10 flat totals).
-- This migration adds the breakdown columns and re-derives the values.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Add new columns (nullable / defaulted so existing rows don't error)
ALTER TABLE charm_aftermarket_rates
  ADD COLUMN IF NOT EXISTS charm_price   numeric(10,2),
  ADD COLUMN IF NOT EXISTS soldering_fee numeric(10,2) NOT NULL DEFAULT 40;

-- Step 2: Backfill charm_price from existing total_price (soldering is $40 flat)
UPDATE charm_aftermarket_rates
SET charm_price = total_price - 40
WHERE charm_price IS NULL AND total_price IS NOT NULL;

-- Step 3: Lock down charm_price as NOT NULL now that every row has a value
ALTER TABLE charm_aftermarket_rates
  ALTER COLUMN charm_price SET NOT NULL;

-- Step 4: Drop the old plain total_price column
ALTER TABLE charm_aftermarket_rates
  DROP COLUMN IF EXISTS total_price;

-- Step 5: Re-add total_price as a generated column (charm_price + soldering_fee)
ALTER TABLE charm_aftermarket_rates
  ADD COLUMN total_price numeric(10,2) GENERATED ALWAYS AS (charm_price + soldering_fee) STORED;
