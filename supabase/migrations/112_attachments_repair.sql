-- 112_attachments_repair.sql
--
-- Repairs a failed 044_attachments.sql. That migration created the attachments
-- table but contained an invalid statement:
--     DISABLE ROW LEVEL SECURITY ON attachments;     -- not valid PostgreSQL
-- The correct form is: ALTER TABLE attachments DISABLE ROW LEVEL SECURITY;
-- Run in a single transaction (the Supabase SQL editor default), the syntax
-- error rolled the whole migration back, so the attachments table was never
-- created in production. Every attachments route therefore fails with
-- "Could not find the table 'public.attachments' in the schema cache"
-- (confirmed live), and adding an image on a Product silently fails to save.
--
-- This migration creates the table with the full column set (044 base + 083
-- extensions) using valid syntax, and restores packets.valuation_photo_url
-- (also lost in the 044 rollback). Idempotent — IF NOT EXISTS throughout.

BEGIN;

CREATE TABLE IF NOT EXISTS attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  file_name    text NOT NULL,
  file_url     text NOT NULL,
  file_type    text NOT NULL,
  file_size    integer,
  uploaded_by  uuid REFERENCES profiles(id),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE attachments DISABLE ROW LEVEL SECURITY;

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS attachment_type text NOT NULL DEFAULT 'other'
    CHECK (attachment_type IN ('photo','certificate','invoice','valuation','cad_file','workshop_document','other'));
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS notes        text;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS archived     boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS attachments_record_idx ON attachments (tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS attachments_type_idx   ON attachments (tenant_id, entity_type, entity_id, attachment_type);

-- Also intended by 044 (line 17), lost in the same rollback.
ALTER TABLE packets ADD COLUMN IF NOT EXISTS valuation_photo_url text;

COMMIT;
