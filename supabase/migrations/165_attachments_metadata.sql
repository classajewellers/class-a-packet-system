-- Staging attachments was created from 044 only. 083 (attachment_type,
-- display_name, notes, archived) never landed, so inventory uploads insert
-- unknown columns and the file list filters on archived, which does not exist.
-- Same columns as 083_attachments_extend.sql. Idempotent.

ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS attachment_type text
    NOT NULL DEFAULT 'other';

ALTER TABLE public.attachments
  DROP CONSTRAINT IF EXISTS attachments_attachment_type_check;

ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_attachment_type_check
  CHECK (attachment_type IN (
    'photo', 'certificate', 'invoice', 'valuation',
    'cad_file', 'workshop_document', 'other'
  ));

ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS attachments_record_idx
  ON public.attachments (tenant_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS attachments_type_idx
  ON public.attachments (tenant_id, entity_type, entity_id, attachment_type);
