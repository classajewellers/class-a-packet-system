-- 071_configurable_stages.sql
-- Makes workshop stages, categories, and unassigned-queue locations
-- fully admin-configurable. Drops the rigid enum constraints on packets
-- (validity is now enforced at the API layer against workshop_stages).

-- ── 1. New tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workshop_stage_categories (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid    NOT NULL,
  name             text    NOT NULL,
  color            text    NOT NULL, -- 'blue'|'amber'|'purple'|'coral'|'teal'|'gray'
  sort_order       int     DEFAULT 0,
  default_collapsed boolean DEFAULT true
);
ALTER TABLE workshop_stage_categories DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS workshop_stages (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid    NOT NULL,
  category_id      uuid    REFERENCES workshop_stage_categories(id) ON DELETE SET NULL,
  key              text    NOT NULL,  -- stable; matches packets.status
  label            text    NOT NULL,  -- editable display name
  intake_substatus text,              -- null = top-level; 'pre_check'|'on_order' for intake sub-stages
  sort_order       int     DEFAULT 0,
  is_locked        boolean DEFAULT false, -- locked = key/substatus/delete protected
  UNIQUE (tenant_id, key, intake_substatus)
);
ALTER TABLE workshop_stages DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS workshop_locations (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid    NOT NULL,
  name       text    NOT NULL,
  job_types  text[]  NOT NULL DEFAULT '{}',
  sort_order int     DEFAULT 0
);
ALTER TABLE workshop_locations DISABLE ROW LEVEL SECURITY;

-- ── 2. Drop rigid enum constraints — API layer enforces validity now ──────────

ALTER TABLE packets DROP CONSTRAINT IF EXISTS packets_status_check;
ALTER TABLE packets DROP CONSTRAINT IF EXISTS packets_job_type_check;

-- ── 3. Seed Class A tenant ────────────────────────────────────────────────────

-- Categories
INSERT INTO workshop_stage_categories (tenant_id, name, color, sort_order, default_collapsed) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Intake',           'blue',   0, false),
  ('00000000-0000-0000-0000-000000000001', 'Unassigned',       'amber',  1, false),
  ('00000000-0000-0000-0000-000000000001', 'Team',             'purple', 2, false),
  ('00000000-0000-0000-0000-000000000001', 'Sub-contractors',  'coral',  3, false),
  ('00000000-0000-0000-0000-000000000001', 'Finishing',        'teal',   4, false)
ON CONFLICT DO NOTHING;

-- Stages — Intake category
INSERT INTO workshop_stages (tenant_id, category_id, key, label, intake_substatus, sort_order, is_locked) VALUES
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM workshop_stage_categories WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND name='Intake'),
   'intake', 'Intake', NULL, 0, true),
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM workshop_stage_categories WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND name='Intake'),
   'intake', 'Pre-Check', 'pre_check', 1, false),
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM workshop_stage_categories WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND name='Intake'),
   'intake', 'On Order', 'on_order', 2, false),
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM workshop_stage_categories WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND name='Intake'),
   'quality_check', 'Quality Control', NULL, 3, false)
ON CONFLICT DO NOTHING;

-- Stages — Finishing category
INSERT INTO workshop_stages (tenant_id, category_id, key, label, intake_substatus, sort_order, is_locked) VALUES
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM workshop_stage_categories WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND name='Finishing'),
   'to_be_valued', 'To-Be-Valued', NULL, 0, true),
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM workshop_stage_categories WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND name='Finishing'),
   'ready', 'Ready for Collection', NULL, 1, false),
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM workshop_stage_categories WHERE tenant_id='00000000-0000-0000-0000-000000000001' AND name='Finishing'),
   'collected', 'Collected', NULL, 2, true)
ON CONFLICT DO NOTHING;

-- Locations (displayed under the Unassigned category)
INSERT INTO workshop_locations (tenant_id, name, job_types, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Manufacturing Orders',      '{custom_order}',                  0),
  ('00000000-0000-0000-0000-000000000001', 'Repairs',                   '{repair}',                        1),
  ('00000000-0000-0000-0000-000000000001', 'Stock Work / Online Orders','{stock_work,online_order}',       2),
  ('00000000-0000-0000-0000-000000000001', 'Collection Orders',         '{collection_order}',              3)
ON CONFLICT DO NOTHING;
