-- 086_po_lines_supplier_design_no.sql
-- Adds supplier's own reference/job number to PO lines so invoices can be
-- matched back to the correct PO line item.
-- inventory_po_lines already has diamond_type/carat/colour/clarity — no new
-- columns are needed for those (the form previously sent stone_* names, which
-- have been corrected in code to match the existing diamond_* column names).

ALTER TABLE inventory_po_lines
  ADD COLUMN IF NOT EXISTS supplier_design_no TEXT;

ALTER TABLE inventory_po_lines DISABLE ROW LEVEL SECURITY;
