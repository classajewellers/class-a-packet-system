ALTER TABLE packets ADD COLUMN IF NOT EXISTS gift_wrapping boolean DEFAULT false;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS delivery_method text DEFAULT 'Pickup';
