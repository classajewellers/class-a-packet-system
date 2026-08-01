-- ============================================================
-- 075_customers_composite_unique.sql
-- Replace the single-column UNIQUE(email) constraint on customers
-- with UNIQUE(email, tenant_id).
--
-- The old constraint prevents the same email appearing in ANY tenant.
-- The new constraint allows the same email in different tenants while
-- still preventing duplicates within a single tenant — correct behaviour
-- for a multi-tenant schema.
--
-- Safe to run on a live single-tenant deployment: the composite constraint
-- is less restrictive than the old one, so no existing rows will violate it.
-- ============================================================

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_email_key;

ALTER TABLE customers
  ADD CONSTRAINT customers_email_tenant_id_key
  UNIQUE (email, tenant_id);
