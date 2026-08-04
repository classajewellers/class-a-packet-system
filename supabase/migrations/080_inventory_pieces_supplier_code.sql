-- 080_inventory_pieces_supplier_code.sql
--
-- Adds supplier_code to inventory_pieces.
--
-- Migration 054 (charm_necklace) attempted to add this column via
-- ADD COLUMN IF NOT EXISTS, but it was never applied in production —
-- confirmed via information_schema 2026-08-04. The charm stock-check
-- routes (charm-components, charm-necklace/configure) depend on this
-- column to match pieces against charm component library entries.

ALTER TABLE inventory_pieces
  ADD COLUMN IF NOT EXISTS supplier_code text;

CREATE INDEX IF NOT EXISTS inventory_pieces_supplier_code_idx
  ON inventory_pieces (supplier_code);
