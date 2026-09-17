-- 085_suppliers_lead_time.sql
-- inventory_suppliers was created in production before lead_time_days was
-- included in the CREATE TABLE definition in migration 023. The IF NOT EXISTS
-- guard on that CREATE TABLE means the missing column was never backfilled.
-- This adds it with IF NOT EXISTS so it is safe to run on both production
-- (where the column is absent) and staging (where migration 023 runs in full).

ALTER TABLE inventory_suppliers
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER;
