-- 119_public_lead_key.sql
-- Per-tenant public "lead capture key" for the unauthenticated website
-- contact-form endpoint (POST /api/public/leads/[public_lead_key]).
--
-- This is NOT a session/API credential. It grants exactly one capability:
-- "create a lead for this tenant with source='website'". If it leaks, the
-- blast radius is spam leads (rate-limited), not data access.
--
-- Random 64-char key, generated without depending on the pgcrypto extension
-- (uses gen_random_uuid(), already used across this schema). UNIQUE + indexed
-- for fast, unambiguous lookup. DEFAULT-generated so new tenants auto-provision.
--
-- Safe to run on staging first, then prod.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS public_lead_key text;

-- Backfill existing tenants (incl. Class A) with a unique key
UPDATE tenants
SET public_lead_key =
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE public_lead_key IS NULL;

-- New tenants auto-generate a key on insert
ALTER TABLE tenants ALTER COLUMN public_lead_key SET DEFAULT
  (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

-- Unique + indexed for lookup by key
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_public_lead_key_unique;
ALTER TABLE tenants ADD  CONSTRAINT tenants_public_lead_key_unique UNIQUE (public_lead_key);
CREATE INDEX IF NOT EXISTS tenants_public_lead_key_idx ON tenants (public_lead_key);
