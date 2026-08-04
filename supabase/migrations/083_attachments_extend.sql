-- 083_attachments_extend.sql
--
-- Extends the existing attachments table (created in 044_attachments.sql)
-- to support inventory_piece, inventory_product, and purchase_order entity types,
-- and adds structured metadata fields required for the inventory attachment UI.
--
-- The original entity_type column has no CHECK constraint, so new entity_type
-- values ('inventory_piece', 'inventory_product', 'purchase_order') work without
-- changing the column definition.
--
-- Existing rows (entity_type = 'packet' or 'quote') are unaffected.

-- Structured attachment classification
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS attachment_type text
    NOT NULL DEFAULT 'other'
    CHECK (attachment_type IN ('photo', 'certificate', 'invoice', 'valuation', 'cad_file', 'workshop_document', 'other'));

-- Optional human-readable name (falls back to file_name in UI)
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS display_name text;

-- Optional free-text notes on the attachment
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS notes text;

-- Soft-delete flag — archived rows are hidden from UI but not hard-deleted
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Efficient lookup by record
CREATE INDEX IF NOT EXISTS attachments_record_idx
  ON attachments (tenant_id, entity_type, entity_id);

-- Efficient filtering by type within a record
CREATE INDEX IF NOT EXISTS attachments_type_idx
  ON attachments (tenant_id, entity_type, entity_id, attachment_type);
