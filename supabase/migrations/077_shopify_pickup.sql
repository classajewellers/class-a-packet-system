-- 077_shopify_pickup.sql
-- Adds columns to packets to support Shopify pickup detection and Admin API fulfillment.
-- delivery_method already exists (text, nullable) from migration 011/031.
-- Values going forward: 'pickup' | 'shipping' | NULL (NULL = not yet classified)

-- Stores the numeric Shopify order ID (needed for Admin API fulfillment calls).
-- order_number stores the human-readable name ("#3299"); this stores the numeric ID.
ALTER TABLE packets ADD COLUMN IF NOT EXISTS shopify_order_id TEXT;

-- Stores the Shopify fulfillment ID once the order is fulfilled via the Admin API,
-- so we know it has already been fulfilled and don't double-fire.
ALTER TABLE packets ADD COLUMN IF NOT EXISTS shopify_fulfillment_id TEXT;
