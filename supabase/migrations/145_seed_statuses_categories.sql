-- 145: seed inventory_statuses / inventory_categories with real production data
--
-- Follow-up to migration 144, which created the tables on staging but left
-- them empty — structurally correct but functionally useless, since
-- inventory_statuses gates core logic (Mark as Sold's ilike '%sold%' name
-- match). Row content confirmed directly by Josh from production
-- (2026-09-22), not invented or inferred.
--
-- ON CONFLICT DO NOTHING keyed on (tenant_id, name) so this is safe to
-- re-run and won't duplicate rows if some of this data is later found to
-- already exist. sort_order matches production's ordering exactly.
--
-- Migration 144 didn't add a uniqueness constraint (production's original
-- hand-created schema doesn't have one either, per Josh's column listing —
-- only a UNIQUE(tenant_id, name) is added here, staging-only, purely so
-- this seed migration is idempotent; it doesn't change production behaviour
-- since this constraint is never applied there).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inventory_statuses_tenant_name_key'
      AND table_name = 'inventory_statuses'
  ) THEN
    ALTER TABLE inventory_statuses
      ADD CONSTRAINT inventory_statuses_tenant_name_key UNIQUE (tenant_id, name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inventory_categories_tenant_name_key'
      AND table_name = 'inventory_categories'
  ) THEN
    ALTER TABLE inventory_categories
      ADD CONSTRAINT inventory_categories_tenant_name_key UNIQUE (tenant_id, name);
  END IF;
END $$;

INSERT INTO inventory_statuses (tenant_id, name, sort_order, is_active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'In stock',                 1, true),
  ('00000000-0000-0000-0000-000000000001', 'Reserved',                 2, true),
  ('00000000-0000-0000-0000-000000000001', 'Sold',                     3, true),
  ('00000000-0000-0000-0000-000000000001', 'On memo',                  4, true),
  ('00000000-0000-0000-0000-000000000001', 'Staff wear',               5, true),
  ('00000000-0000-0000-0000-000000000001', 'In production',            6, true),
  ('00000000-0000-0000-0000-000000000001', 'In repair',                7, true),
  ('00000000-0000-0000-0000-000000000001', 'Awaiting photography',     8, true),
  ('00000000-0000-0000-0000-000000000001', 'Awaiting valuation',       9, true),
  ('00000000-0000-0000-0000-000000000001', 'Awaiting pricing',        10, true),
  ('00000000-0000-0000-0000-000000000001', 'Ready for collection',    11, true),
  ('00000000-0000-0000-0000-000000000001', 'Missing / discrepancy',   12, true)
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO inventory_categories (tenant_id, name, sort_order, is_active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Engagement rings', 1, true),
  ('00000000-0000-0000-0000-000000000001', 'Wedding bands',    2, true),
  ('00000000-0000-0000-0000-000000000001', 'Rings',            3, true),
  ('00000000-0000-0000-0000-000000000001', 'Earrings',         4, true),
  ('00000000-0000-0000-0000-000000000001', 'Necklaces',        5, true),
  ('00000000-0000-0000-0000-000000000001', 'Bracelets',        6, true),
  ('00000000-0000-0000-0000-000000000001', 'Pendants',         7, true),
  ('00000000-0000-0000-0000-000000000001', 'Loose stones',     8, true),
  ('00000000-0000-0000-0000-000000000001', 'Other',            9, true)
ON CONFLICT (tenant_id, name) DO NOTHING;
