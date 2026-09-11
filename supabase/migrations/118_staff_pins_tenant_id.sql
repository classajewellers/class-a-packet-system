-- 118_staff_pins_tenant_id.sql
-- Tenant-isolate staff_pins. Previously global (no tenant_id): PIN verification
-- matched on name only, so any tenant's staff PIN authenticated PIN-gated
-- actions on ANY tenant, and the name UNIQUE constraint prevented two tenants
-- from having a staff member with the same name.
--
-- This migration adds tenant_id (backfilled to Class A), makes it NOT NULL in
-- one step (no app code inserts staff_pins — only SELECTs — so nothing breaks;
-- and a nullable tenant on an auth table would reintroduce the global gap), and
-- swaps the UNIQUE key from (name) to (tenant_id, name).
--
-- RLS is unchanged: staff_pins stays RLS-enabled with no policy (deny-all); all
-- access is via the service-role key, which bypasses RLS. Isolation is enforced
-- by the .eq("tenant_id", ...) filters in the routes, with deny-all as backstop.
--
-- Run on vault-staging first, then production. Class A tenant id is
-- 00000000-0000-0000-0000-000000000001 on both.

-- 1. Add the column (nullable first so the backfill can run)
ALTER TABLE staff_pins ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- 2. Backfill every existing row to Class A
UPDATE staff_pins
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- 3. Tighten to NOT NULL now that no nulls remain
ALTER TABLE staff_pins ALTER COLUMN tenant_id SET NOT NULL;

-- 4. Swap the UNIQUE constraint: name is unique PER TENANT, not globally
ALTER TABLE staff_pins DROP CONSTRAINT IF EXISTS staff_pins_name_key;
ALTER TABLE staff_pins DROP CONSTRAINT IF EXISTS staff_pins_tenant_name_key;
ALTER TABLE staff_pins ADD  CONSTRAINT staff_pins_tenant_name_key UNIQUE (tenant_id, name);

-- 5. Index for the tenant-scoped lookups
CREATE INDEX IF NOT EXISTS staff_pins_tenant_id_idx ON staff_pins (tenant_id);
