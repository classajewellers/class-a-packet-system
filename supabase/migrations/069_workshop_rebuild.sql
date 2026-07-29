-- 069_workshop_rebuild.sql
-- Workshop rebuild: packets as source of truth.
-- Stops writing to workshop_jobs; all tracking on packets.

-- ── 1. New columns on packets ─────────────────────────────────────────────────

-- customer_id: resolved BEFORE insert so every packet is linked on creation
ALTER TABLE packets ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

-- Workshop-specific columns
ALTER TABLE packets ADD COLUMN IF NOT EXISTS workshop_subcontractor_name TEXT;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS workshop_pathway_id         UUID;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS workshop_step_index         INT     DEFAULT 0;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS workshop_intake_substatus   TEXT    DEFAULT 'jobs_in';
  -- jobs_in | pre_check | on_order
ALTER TABLE packets ADD COLUMN IF NOT EXISTS workshop_needs_valuation    BOOLEAN DEFAULT false;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS workshop_valuer             TEXT;

-- Procurement fields: NOT already in item_specifications JSONB.
-- (item_type/category, ring_size, metal_type/weight, stones, accent_description
--  are already representable in item_specifications; second-metal, engraving,
--  metal-preference, reference-notes are also addable as JSONB keys with no migration.)
ALTER TABLE packets ADD COLUMN IF NOT EXISTS workshop_supplier   TEXT;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS workshop_po_number  TEXT;

-- ── 2. Support tables (lookup lists, not job records) ─────────────────────────

CREATE TABLE IF NOT EXISTS workshop_team_members (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid    NOT NULL,
  name        text    NOT NULL,
  profile_id  uuid    REFERENCES profiles(id),  -- nullable; link via Settings
  sort_order  int     DEFAULT 0,
  active      boolean DEFAULT true
);
ALTER TABLE workshop_team_members DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS workshop_subcontractors (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid    NOT NULL,
  name        text    NOT NULL,
  sort_order  int     DEFAULT 0,
  active      boolean DEFAULT true
);
ALTER TABLE workshop_subcontractors DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS workshop_valuers (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid    NOT NULL,
  name      text    NOT NULL,
  active    boolean DEFAULT true
);
ALTER TABLE workshop_valuers DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS workshop_pathways (
  id        uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid  NOT NULL,
  name      text  NOT NULL,
  steps     jsonb NOT NULL DEFAULT '[]'
  -- step shape: [{name: text, location: 'inhouse'|'external'}]
);
ALTER TABLE workshop_pathways DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS workshop_manager_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL,
  text       text        NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE workshop_manager_messages DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS workshop_lead_times (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid    NOT NULL,
  job_type  text    NOT NULL,
  weeks     numeric,
  UNIQUE (tenant_id, job_type)
);
ALTER TABLE workshop_lead_times DISABLE ROW LEVEL SECURITY;

-- ── 3. Class A tenant seed data ───────────────────────────────────────────────

INSERT INTO workshop_team_members (tenant_id, name, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Ben',   1),
  ('00000000-0000-0000-0000-000000000001', 'Viv',   2),
  ('00000000-0000-0000-0000-000000000001', 'Joe',   3),
  ('00000000-0000-0000-0000-000000000001', 'David', 4),
  ('00000000-0000-0000-0000-000000000001', 'Jack',  5)
ON CONFLICT DO NOTHING;

INSERT INTO workshop_subcontractors (tenant_id, name, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Ryan',                1),
  ('00000000-0000-0000-0000-000000000001', 'Joel',                2),
  ('00000000-0000-0000-0000-000000000001', 'Nam',                 3),
  ('00000000-0000-0000-0000-000000000001', 'McAskills',           4),
  ('00000000-0000-0000-0000-000000000001', 'Chris Green',         5),
  ('00000000-0000-0000-0000-000000000001', 'Donna (Restringing)', 6)
ON CONFLICT DO NOTHING;

INSERT INTO workshop_valuers (tenant_id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Sam'),
  ('00000000-0000-0000-0000-000000000001', 'Brad')
ON CONFLICT DO NOTHING;

INSERT INTO workshop_pathways (tenant_id, name, steps) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Fully Produced & Set Externally',
    '[{"name":"External Production & Setting","location":"external"}]'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Remodel',
    '[{"name":"Unsetting","location":"inhouse"},{"name":"CAD Drawing","location":"inhouse"},{"name":"Cast Clean-up & Assembly","location":"inhouse"},{"name":"Sub-Contracted Setting","location":"external"}]'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Fully Made & Set In-House',
    '[{"name":"Cast Clean-up & Assembly","location":"inhouse"},{"name":"Setting","location":"inhouse"}]'::jsonb
  )
ON CONFLICT DO NOTHING;
