-- -----------------------------------------------------------------------------
-- 128: deposit_percentage as a per-tenant setting (B2)
--
-- Was hardcoded 0.3 (30%) in app/api/quotes/[id]/payment-link/route.ts.
-- Stored as a whole-number percentage (30.00 meaning 30%), matching how it
-- reads in Settings, converted to a fraction at the point of use.
--
-- Same pattern as the existing tenant-scalar settings (bank_name/account_name/
-- bsb/account_number added in 055_follow_up_bank_details.sql) - a plain
-- column on tenants, not a new table, since this is a single per-tenant value
-- with no sub-structure.
--
-- Default 30.00 preserves today's behaviour for every existing tenant with
-- no explicit value set.
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- -----------------------------------------------------------------------------

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deposit_percentage numeric(5,2) NOT NULL DEFAULT 30.00;
