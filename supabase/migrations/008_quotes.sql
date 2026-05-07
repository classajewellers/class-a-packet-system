-- Quotes table
CREATE TABLE IF NOT EXISTS quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  reference_number text unique not null,
  quote_type text not null,
  status text default 'pending',
  customer_first_name text,
  customer_last_name text,
  customer_email text,
  customer_phone text,
  item_description text,
  line_items jsonb,
  total numeric,
  notes text,
  repair_description text,
  design_brief text,
  metal_type text,
  stone_details text,
  estimated_turnaround text,
  staff_member text,
  converted_to_packet_id uuid references packets(id),
  converted_at timestamptz,
  packet_reference text
);

ALTER TABLE daily_counters ADD COLUMN IF NOT EXISTS quote_count int default 0;

CREATE OR REPLACE FUNCTION increment_quote_counter(input_date date)
RETURNS int AS $$
  INSERT INTO daily_counters (date, packet_count, quote_count)
  VALUES (input_date, 0, 1)
  ON CONFLICT (date) DO UPDATE
    SET quote_count = daily_counters.quote_count + 1
  RETURNING daily_counters.quote_count;
$$ LANGUAGE sql;
