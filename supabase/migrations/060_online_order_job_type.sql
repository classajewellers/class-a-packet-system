-- Add source_order_ref to packets (links workshop packet back to originating order)
ALTER TABLE packets ADD COLUMN IF NOT EXISTS source_order_ref TEXT;

-- Expand job_type check constraint to include online_order
ALTER TABLE packets DROP CONSTRAINT IF EXISTS packets_job_type_check;
ALTER TABLE packets ADD CONSTRAINT packets_job_type_check
  CHECK (job_type IN ('repair', 'custom_order', 'stock_work', 'online_order'));

-- Backfill job_type for online orders
UPDATE packets SET job_type = 'online_order' WHERE packet_type = 'online_order' AND (job_type IS NULL OR job_type != 'online_order');
UPDATE packets SET job_type = 'custom_order' WHERE packet_type = 'custom_order' AND (job_type IS NULL OR job_type != 'custom_order');
