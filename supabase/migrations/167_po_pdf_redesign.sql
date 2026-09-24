-- Purchase order PDF fields.
-- Staging tenants already has name, phone, email, address, brand_logo_url, gst_registered.
-- Staging inventory_suppliers already has lead_time_days, contact_name, email, phone.
-- Staging inventory_purchase_orders already has notes, expected_date, order_date.
-- supplier_design_no stays the supplier's own reference. sku is the product code.
-- Apply on staging only. Do not run against production.

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

ALTER TABLE public.inventory_po_lines
  ADD COLUMN IF NOT EXISTS sku text;
