-- Adds actual_cost to inventory_pieces.
-- Records the cost paid when a piece is received from a PO,
-- used for gross-profit calculations on sale. Distinct from
-- inventory_po_lines.actual_cost (the per-line invoiced amount).

ALTER TABLE inventory_pieces ADD COLUMN IF NOT EXISTS actual_cost numeric;

ALTER TABLE inventory_pieces DISABLE ROW LEVEL SECURITY;
