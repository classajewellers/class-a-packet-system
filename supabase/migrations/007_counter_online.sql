-- Add online_order counter column to daily_counters
ALTER TABLE daily_counters ADD COLUMN IF NOT EXISTS online_order_count int default 0;

-- RPC for online order reference numbers (ON-YYYYMMDD-XXXX)
CREATE OR REPLACE FUNCTION increment_online_order_counter(input_date date)
RETURNS int AS $$
  INSERT INTO daily_counters (date, packet_count, online_order_count)
  VALUES (input_date, 0, 1)
  ON CONFLICT (date) DO UPDATE
    SET online_order_count = daily_counters.online_order_count + 1
  RETURNING daily_counters.online_order_count;
$$ LANGUAGE sql;
