-- 047_sapphire_stock.sql
-- Sapphire Export melee diamond stock cache

CREATE TABLE IF NOT EXISTS sapphire_stock (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_no      text          UNIQUE NOT NULL,
  shape         text,
  carat         numeric,
  color         text,
  clarity       text,
  cut           text,
  polish        text,
  symmetry      text,
  fluorescence  text,
  lab           text,
  asking_rate   numeric,
  total_price   numeric,
  stock_type    text,
  availability  text,
  length        numeric,
  width         numeric,
  depth         numeric,
  synced_at     timestamptz   DEFAULT now()
);

ALTER TABLE sapphire_stock DISABLE ROW LEVEL SECURITY;
