-- Remove ordered toggle (no longer used)
ALTER TABLE packets DROP COLUMN IF EXISTS ordered;
