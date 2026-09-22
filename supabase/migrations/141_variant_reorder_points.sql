-- 141: reorder points / low-stock thresholds (quantity-tracked variants)
--
-- Part of the 2026-09-22 operational-readiness build (VAULT_BUILD_CHECKLIST.md,
-- Phase 1.1c). Follow-up to migration 138, which scoped reorder points to
-- inventory_products only because inventory_product_variants and
-- inventory_stock_levels didn't exist on staging yet (095/113 drift). That
-- drift was closed by migration 139 — this migration completes the original
-- plan by adding the variant-side reorder point and extending
-- inventory_low_stock to cover quantity-tracked stock too.
--
-- Same principle as 138: nullable, no default threshold enforced on existing
-- rows. A NULL reorder_point means "no threshold configured."
--
-- Quantity for a quantity-tracked variant is the SUM of inventory_stock_levels
-- across all locations (not a per-location count), since reorder decisions
-- are made at the variant level, not per-shelf.

ALTER TABLE inventory_product_variants
  ADD COLUMN IF NOT EXISTS reorder_point integer CHECK (reorder_point IS NULL OR reorder_point >= 0);

-- Replaces the 138 definition with a UNION of both tracking models:
--   - 'product'  = serialized designs (inventory_products), unchanged from 138
--   - 'variant'  = quantity-tracked variants (inventory_product_variants),
--                  only meaningful when tracking_mode = 'quantity' — a
--                  serialized variant's stock is counted via inventory_pieces,
--                  not inventory_stock_levels, so it's excluded here to avoid
--                  double-counting or a meaningless always-zero row.
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
  HAVING COUNT(ip.id) FILTER (WHERE ip.status = 'in_stock') <= p.reorder_point

  UNION ALL

  SELECT
    'variant'::text AS item_type,
    v.id             AS item_id,
    v.tenant_id,
    COALESCE(v.name, v.metal_karat || ' ' || v.metal_colour) AS item_name,
    v.reorder_point,
    COALESCE(SUM(sl.quantity), 0) AS current_quantity
  FROM inventory_product_variants v
  LEFT JOIN inventory_stock_levels sl ON sl.variant_id = v.id
  WHERE v.reorder_point IS NOT NULL
    AND v.tracking_mode = 'quantity'
  GROUP BY v.id, v.tenant_id, v.name, v.metal_karat, v.metal_colour, v.reorder_point
  HAVING COALESCE(SUM(sl.quantity), 0) <= v.reorder_point;
