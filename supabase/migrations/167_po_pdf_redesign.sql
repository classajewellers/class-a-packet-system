-- Purchase order PDF fields. Staging apply only. Do not run against production.
-- Legal name stays tenants.name. Phone, email, address, brand_logo_url, and
-- gst_registered already exist. Supplier lead time already exists.
-- PO notes and expected_date already exist. Line product code stays
-- inventory_po_lines.supplier_design_no. Do not add a sku column.
-- Do not create a business_details table. Do not seed letterhead.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS abn text;

ALTER TABLE public.inventory_suppliers
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.inventory_suppliers
  ADD COLUMN IF NOT EXISTS payment_terms text;

ALTER TABLE public.inventory_purchase_orders
  ADD COLUMN IF NOT EXISTS payment_terms text;

ALTER TABLE public.inventory_purchase_orders
  ADD COLUMN IF NOT EXISTS ship_to_address text;
