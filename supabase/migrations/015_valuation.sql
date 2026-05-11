ALTER TABLE packets ADD COLUMN IF NOT EXISTS item_specifications jsonb default '{}';
ALTER TABLE packets ADD COLUMN IF NOT EXISTS valuation_status text default 'draft';
ALTER TABLE packets ADD COLUMN IF NOT EXISTS valuation_approved_at timestamptz;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS valuation_approved_by text;
ALTER TABLE packets ADD COLUMN IF NOT EXISTS estimated_replacement_value numeric;
ALTER TABLE daily_counters ADD COLUMN IF NOT EXISTS valuation_count int default 0;

CREATE OR REPLACE FUNCTION increment_valuation_counter(input_date date)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE new_count int;
BEGIN
  INSERT INTO daily_counters (date, valuation_count) VALUES (input_date, 1)
  ON CONFLICT (date) DO UPDATE SET valuation_count = daily_counters.valuation_count + 1
  RETURNING valuation_count INTO new_count;
  RETURN new_count;
END;
$$;
