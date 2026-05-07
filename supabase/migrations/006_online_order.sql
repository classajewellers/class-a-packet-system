-- Add online order columns
ALTER TABLE packets ADD COLUMN IF NOT EXISTS order_number text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS shipping_method text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS shipping_address_same boolean default true;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS shipping_street text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS shipping_suburb text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS shipping_state text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS shipping_postcode text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS items_ordered text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS order_notes text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS tracking_number text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS order_source text;
