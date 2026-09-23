-- Design change confirmed 2026-09-23: drop the "map once in Settings"
-- Chart of Accounts mapping (tenant_xero_account_mappings, built earlier
-- today) in favour of choosing the Xero account directly on each Purchase
-- Order line item — a PO already has multiple lines, each with its own
-- single cost figure (inventory_po_lines.estimated_cost/actual_cost, no
-- further cost-component breakdown), so per-line is the natural fit,
-- matching the existing per-line category_id selector.
--
-- tenant_xero_account_mappings had zero real rows (built and merged the
-- same day it's being removed, never wired into anything else — confirmed
-- via full-codebase grep before dropping) — safe to drop outright, nothing
-- to migrate.
--
-- xero_account_id/code/name are denormalised onto the line itself, same
-- reasoning as the mapping table had: a historical PO line's billing
-- record shouldn't change retroactively if the account gets renamed in
-- Xero later.

DROP TABLE IF EXISTS public.tenant_xero_account_mappings;

ALTER TABLE public.inventory_po_lines
  ADD COLUMN IF NOT EXISTS xero_account_id   uuid,
  ADD COLUMN IF NOT EXISTS xero_account_code text,
  ADD COLUMN IF NOT EXISTS xero_account_name text;
