-- 142: link inventory_sales to packets (Phase 1.2 — unify sell-from-stock)
--
-- Part of the 2026-09-22 operational-readiness build (VAULT_BUILD_CHECKLIST.md,
-- Phase 1.2). Confirmed by direct code search: inventory_sales (migration 079)
-- has exactly one writer (app/api/inventory/sales/route.ts, the "Mark as
-- Sold" flow) and zero other readers anywhere in the codebase — no report,
-- dashboard, or other route depends on its current disconnected shape. Safe
-- to extend in place, no backfill needed for existing rows (packet_id stays
-- NULL for sales recorded before this migration).
--
-- Going forward, "Mark as Sold" also creates a packets row (packet_type =
-- 'stock_sale') via the same createPacket() used by every other order path,
-- so stock sales become visible to Reports, customer history, and staff
-- performance instead of being a disconnected ledger. inventory_sales
-- remains the source of truth for sale-specific detail (discount_amount,
-- payment_method) — packets.total_charges holds the GROSS sold price per
-- Josh's instruction (2026-09-22): net is computed as
-- packets.total_charges - inventory_sales.discount_amount, never collapsed
-- into a single stored number.

ALTER TABLE inventory_sales
  ADD COLUMN IF NOT EXISTS packet_id uuid REFERENCES packets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_sales_packet_idx
  ON inventory_sales (packet_id);
