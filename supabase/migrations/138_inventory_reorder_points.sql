-- 138: reorder points / low-stock thresholds (serialized designs)
--
-- Part of the 2026-09-22 operational-readiness build (VAULT_BUILD_CHECKLIST.md,
-- Phase 1.1). No reorder/low-stock concept existed on the live inventory model —
-- the only prior art was a `reorder_point` column on the dead legacy
-- inventory_items table (migration 023), explicitly marked "legacy types
-- (pre-schema-migration)" in lib/types.ts and unused by any live route.
--
-- SCOPE NOTE — staging/production drift discovered while writing this:
-- the original plan also added a reorder_point to inventory_product_variants
-- (migration 095) for quantity-tracked stock (migration 113,
-- inventory_stock_levels). Checked staging directly: NEITHER
-- inventory_product_variants NOR inventory_stock_levels exists there at all —
-- migrations 095 and 113 were apparently never applied to vault-staging,
-- the same class of drift as 077 and 115 found earlier this session. Rather
-- than guess at re-applying migrations I didn't author onto an unknown-state
-- database, this migration is scoped to ONLY inventory_products/
-- inventory_pieces, which are confirmed present and unchanged on both
-- environments. The variant-level reorder point is tracked as a follow-up
-- in VAULT_BUILD_CHECKLIST.md, blocked on resolving that drift first —
-- flagged for Josh, not silently worked around.
--
-- Nullable, no default threshold enforced on existing rows — a NULL reorder
-- point means "no threshold configured," not "reorder immediately." Setting
-- an actual number is a deliberate per-item decision (same principle as
-- tracking_mode in migration 113 - never inferred from a heuristic).
--
-- Schema + a reusable view only. The low-stock report/alert UI that reads
-- this view is separate, later work (VAULT_BUILD_CHECKLIST.md Phase 3, built
-- on the reporting engine so this isn't a one-off page).

ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS reorder_point integer CHECK (reorder_point IS NULL OR reorder_point >= 0);

-- ── Reusable low-stock view (serialized designs only, for now) ───────────────
-- Counts in_stock pieces per design against its reorder point. One place that
-- knows how to compute this, so the reporting engine and any low-stock badge
-- read from here instead of re-deriving the logic per caller. Extend with a
-- variant-side UNION once the 095/113 staging drift above is resolved.
CREATE OR REPLACE VIEW inventory_low_stock AS
  SELECT
    'product'::text AS item_type,
    p.id             AS item_id,
    p.tenant_id,
    p.name           AS item_name,
    p.reorder_point,
    COUNT(ip.id) FILTER (WHERE ip.status = 'in_stock') AS current_quantity
  FROM inventory_products p
  LEFT JOIN inventory_pieces ip ON ip.product_id = p.id
  WHERE p.reorder_point IS NOT NULL
  GROUP BY p.id, p.tenant_id, p.name, p.reorder_point
  HAVING COUNT(ip.id) FILTER (WHERE ip.status = 'in_stock') <= p.reorder_point;
