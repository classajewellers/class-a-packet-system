-- Supplier invoice due date and the Xero draft bill id.
-- Staging inventory_purchase_invoices already has tenant_id and po_id.
-- Invoice files stay on attachments (entity_type purchase_order).
-- Do not widen the status check. Vault only writes xero_status = DRAFT.

ALTER TABLE public.inventory_purchase_invoices
  ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE public.inventory_purchase_invoices
  ADD COLUMN IF NOT EXISTS xero_invoice_id text;

ALTER TABLE public.inventory_purchase_invoices
  ADD COLUMN IF NOT EXISTS xero_status text;
