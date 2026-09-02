-- 110: Add catalog_import_config to inventory_suppliers
--
-- Stores supplier-specific catalog import rules as JSONB so the import
-- route reads config generically for whichever supplier is selected.
-- No supplier names are hardcoded in application code — parsing rules
-- are data, scoped to each tenant's supplier record.
--
-- The column is nullable; suppliers without a config simply cannot be
-- used as a catalog import source until a config is populated.

ALTER TABLE inventory_suppliers
  ADD COLUMN IF NOT EXISTS catalog_import_config jsonb;
