-- Split customer_address into separate fields
ALTER TABLE packets RENAME COLUMN customer_address TO customer_street;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS customer_suburb text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS customer_state text;
-- customer_postcode already exists
