-- ─────────────────────────────────────────────────────────────────────────────
-- 031: Fix delivery_method defaulting to 'Pickup' for online orders.
--
-- Root cause: the column was created with DEFAULT 'Pickup', so any packet type
-- that didn't explicitly set delivery_method (online_order, layby, client_intake)
-- silently stored 'Pickup'. resolveDelivery() checks delivery_method before
-- shipping_method, so online orders with real shipping data showed 'Pickup'.
--
-- Fix:
--   1. Change the column default to NULL (repair/custom_order still set it explicitly).
--   2. Clear the incorrect 'Pickup' value from all existing online_order packets
--      so resolveDelivery() falls through to shipping_method instead.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Remove the hardcoded 'Pickup' default so only repair/custom_order rows
--    get an explicit delivery_method value going forward.
ALTER TABLE packets
  ALTER COLUMN delivery_method SET DEFAULT NULL;

-- 2. Fix existing online_order packets that inherited the wrong default.
--    Repair/custom_order packets with 'Pickup' are left alone — that is correct
--    (staff may have intentionally left the default when the customer is picking up).
UPDATE packets
SET delivery_method = NULL
WHERE packet_type = 'online_order'
  AND delivery_method = 'Pickup';
