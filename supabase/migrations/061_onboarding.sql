-- ============================================================
-- 061_onboarding.sql
-- Adds onboarding wizard state and extended store details to tenants
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_step     INT     NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone               TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email               TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address             TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website             TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gst_registered      BOOLEAN NOT NULL DEFAULT true;

-- Mark all existing tenants as having completed onboarding so they
-- are not redirected to the wizard on their next login.
UPDATE tenants SET onboarding_complete = true, onboarding_step = 5;
