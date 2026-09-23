-- Production bug: creating an inventory_locations row fails with
-- "Could not find the 'bin_code_format' column ... in the schema cache".
--
-- Confirmed via a read-only column listing against production (2026-09-23):
-- production's inventory_locations only has
-- id, tenant_id, name, type, sort_order, is_active, created_at — missing
-- bin_code_format, shopify_visible, and parent_id entirely. This is wider
-- than the reported symptom (bin_code_format) — the parent-location
-- hierarchy feature the UI already exposes doesn't exist in production's
-- database at all.
--
-- Definitions below are copied verbatim from the migrations that
-- introduced each column on staging, so types/defaults/FK behavior match
-- exactly: bin_code_format + shopify_visible from 023_inventory.sql,
-- parent_id from 082_inventory_locations_hierarchy.sql (the later,
-- ON DELETE SET NULL version — not 024's ON DELETE CASCADE, since 082 is
-- explicitly the safer one designed for an environment where 024 never
-- ran, which is exactly production's situation here).
--
-- NOTE: production also has sort_order and is_active columns that staging's
-- inventory_locations does NOT have. This migration does not touch those —
-- it only adds what's missing, per the scope of the reported bug. Flagging
-- this as a separate, distinct piece of schema divergence worth a decision
-- later, not fixed here.

ALTER TABLE public.inventory_locations
  ADD COLUMN IF NOT EXISTS bin_code_format text;

ALTER TABLE public.inventory_locations
  ADD COLUMN IF NOT EXISTS shopify_visible boolean NOT NULL DEFAULT false;

ALTER TABLE public.inventory_locations
  ADD COLUMN IF NOT EXISTS parent_id uuid
    REFERENCES public.inventory_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_locations_parent_idx
  ON public.inventory_locations (parent_id);
